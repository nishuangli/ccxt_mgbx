# Rate Limiting Design

## Overview

Rate limiting is a critical component of the CCXT library that prevents API abuse and ensures compliance with exchange-imposed request limits. Each cryptocurrency exchange has different rate limiting policies, and CCXT must handle these dynamically while providing optimal performance.

## Goals

- **Compliance**: Ensure all requests comply with exchange rate limits
- **Performance**: Maximize throughput within rate limit constraints
- **Reliability**: Prevent temporary or permanent API bans
- **Fairness**: Balance requests across multiple users/applications
- **Transparency**: Provide clear feedback on rate limit status

## Rate Limiting Strategies

### 1. Token Bucket Algorithm

The primary rate limiting mechanism uses a token bucket approach:

```typescript
class TokenBucket {
  private tokens: number;
  private lastRefill: number;
  private readonly capacity: number;
  private readonly refillRate: number; // tokens per second
  
  constructor(capacity: number, refillRate: number) {
    this.capacity = capacity;
    this.refillRate = refillRate;
    this.tokens = capacity;
    this.lastRefill = Date.now();
  }
  
  async consume(tokens: number = 1): Promise<boolean> {
    this.refill();
    
    if (this.tokens >= tokens) {
      this.tokens -= tokens;
      return true;
    }
    
    // Wait for tokens to become available
    const waitTime = (tokens - this.tokens) / this.refillRate * 1000;
    await this.sleep(waitTime);
    return this.consume(tokens);
  }
  
  private refill(): void {
    const now = Date.now();
    const elapsed = (now - this.lastRefill) / 1000;
    const tokensToAdd = elapsed * this.refillRate;
    
    this.tokens = Math.min(this.capacity, this.tokens + tokensToAdd);
    this.lastRefill = now;
  }
}
```

### 2. Per-Exchange Rate Limiting

Each exchange has different rate limiting policies:

```typescript
interface RateLimitConfig {
  requests: number;        // Number of requests
  interval: number;        // Time interval in milliseconds
  byIP: boolean;          // Whether limit is per IP or per API key
  endpoints: {            // Endpoint-specific limits
    [endpoint: string]: {
      requests: number;
      interval: number;
      weight?: number;     // Request weight for weighted limits
    };
  };
}

const exchangeRateLimits: { [exchange: string]: RateLimitConfig } = {
  binance: {
    requests: 1200,
    interval: 60000, // 1 minute
    byIP: true,
    endpoints: {
      'GET /api/v3/ticker/price': { requests: 2, interval: 1000 },
      'POST /api/v3/order': { requests: 10, interval: 1000, weight: 1 }
    }
  },
  coinbase: {
    requests: 10000,
    interval: 3600000, // 1 hour
    byIP: false,
    endpoints: {}
  }
};
```

### 3. Adaptive Rate Limiting

The system adapts to changing conditions:

```typescript
class AdaptiveRateLimiter {
  private baseLimit: number;
  private currentLimit: number;
  private errorCount: number = 0;
  private successCount: number = 0;
  
  constructor(baseLimit: number) {
    this.baseLimit = baseLimit;
    this.currentLimit = baseLimit;
  }
  
  onSuccess(): void {
    this.successCount++;
    this.errorCount = Math.max(0, this.errorCount - 1);
    
    // Gradually increase limit on success
    if (this.successCount % 10 === 0) {
      this.currentLimit = Math.min(
        this.baseLimit,
        this.currentLimit * 1.1
      );
    }
  }
  
  onError(error: any): void {
    if (this.isRateLimitError(error)) {
      this.errorCount++;
      // Decrease limit on rate limit errors
      this.currentLimit *= 0.5;
      this.successCount = 0;
    }
  }
  
  private isRateLimitError(error: any): boolean {
    return error.status === 429 || 
           error.message?.includes('rate limit') ||
           error.code === 'RATE_LIMIT_EXCEEDED';
  }
}
```

## Implementation Architecture

### Rate Limiter Manager

```typescript
class RateLimiterManager {
  private limiters: Map<string, TokenBucket> = new Map();
  private configs: Map<string, RateLimitConfig> = new Map();
  
  constructor() {
    this.initializeExchangeLimiters();
  }
  
  async checkLimit(
    exchange: string, 
    endpoint?: string, 
    weight: number = 1
  ): Promise<void> {
    const limiter = this.getLimiter(exchange, endpoint);
    await limiter.consume(weight);
  }
  
  private getLimiter(exchange: string, endpoint?: string): TokenBucket {
    const key = endpoint ? `${exchange}:${endpoint}` : exchange;
    
    if (!this.limiters.has(key)) {
      const config = this.getConfig(exchange, endpoint);
      const limiter = new TokenBucket(
        config.requests,
        config.requests / (config.interval / 1000)
      );
      this.limiters.set(key, limiter);
    }
    
    return this.limiters.get(key)!;
  }
}
```

### Integration with Exchange Classes

```typescript
abstract class Exchange {
  protected rateLimiter: RateLimiterManager;
  
  protected async request(
    path: string, 
    api: string = 'public', 
    method: string = 'GET',
    params: any = {}
  ): Promise<any> {
    // Check rate limit before making request
    await this.rateLimiter.checkLimit(this.id, `${method} ${path}`);
    
    try {
      const response = await this.httpClient.request({
        url: this.buildURL(path, api),
        method,
        params,
        headers: this.getHeaders(api, method, path, params)
      });
      
      // Update rate limiter on success
      this.rateLimiter.onSuccess(this.id);
      
      return response;
    } catch (error) {
      // Update rate limiter on error
      this.rateLimiter.onError(this.id, error);
      throw error;
    }
  }
}
```

## Rate Limit Detection

### Response Header Analysis

```typescript
class RateLimitDetector {
  static extractRateLimitInfo(headers: any): RateLimitInfo {
    return {
      limit: parseInt(headers['x-ratelimit-limit']) || null,
      remaining: parseInt(headers['x-ratelimit-remaining']) || null,
      reset: parseInt(headers['x-ratelimit-reset']) || null,
      retryAfter: parseInt(headers['retry-after']) || null
    };
  }
  
  static shouldBackoff(rateLimitInfo: RateLimitInfo): number {
    if (rateLimitInfo.retryAfter) {
      return rateLimitInfo.retryAfter * 1000;
    }
    
    if (rateLimitInfo.remaining !== null && rateLimitInfo.remaining < 5) {
      const now = Date.now() / 1000;
      const resetTime = rateLimitInfo.reset || (now + 60);
      return Math.max(0, (resetTime - now) * 1000);
    }
    
    return 0;
  }
}
```

### Error Code Analysis

```typescript
const RATE_LIMIT_ERROR_CODES = {
  429: 'Too Many Requests',
  503: 'Service Unavailable (Rate Limited)',
  'RATE_LIMIT_EXCEEDED': 'Exchange-specific rate limit',
  'ORDER_RATE_LIMIT': 'Order placement rate limit',
  'REQUEST_WEIGHT_EXCEEDED': 'Request weight limit exceeded'
};

function isRateLimitError(error: any): boolean {
  return error.status === 429 ||
         error.status === 503 ||
         Object.keys(RATE_LIMIT_ERROR_CODES).some(code => 
           error.code?.includes(code) || 
           error.message?.includes(code)
         );
}
```

## Backoff Strategies

### Exponential Backoff

```typescript
class ExponentialBackoff {
  private attempt: number = 0;
  private readonly maxAttempts: number;
  private readonly baseDelay: number;
  private readonly maxDelay: number;
  
  constructor(maxAttempts = 5, baseDelay = 1000, maxDelay = 30000) {
    this.maxAttempts = maxAttempts;
    this.baseDelay = baseDelay;
    this.maxDelay = maxDelay;
  }
  
  async execute<T>(operation: () => Promise<T>): Promise<T> {
    try {
      const result = await operation();
      this.attempt = 0; // Reset on success
      return result;
    } catch (error) {
      if (!isRateLimitError(error) || this.attempt >= this.maxAttempts) {
        throw error;
      }
      
      const delay = Math.min(
        this.baseDelay * Math.pow(2, this.attempt),
        this.maxDelay
      );
      
      this.attempt++;
      await this.sleep(delay);
      
      return this.execute(operation);
    }
  }
  
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
```

### Jittered Backoff

```typescript
function jitteredBackoff(attempt: number, baseDelay: number): number {
  const exponentialDelay = baseDelay * Math.pow(2, attempt);
  const jitter = Math.random() * 0.3; // 30% jitter
  return exponentialDelay * (1 + jitter);
}
```

## Monitoring and Observability

### Rate Limit Metrics

```typescript
interface RateLimitMetrics {
  requestsPerSecond: number;
  averageResponseTime: number;
  rateLimitHits: number;
  backoffEvents: number;
  adaptiveAdjustments: number;
}

class RateLimitMonitor {
  private metrics: Map<string, RateLimitMetrics> = new Map();
  
  recordRequest(exchange: string, responseTime: number): void {
    const metric = this.getOrCreateMetric(exchange);
    metric.requestsPerSecond++;
    metric.averageResponseTime = 
      (metric.averageResponseTime + responseTime) / 2;
  }
  
  recordRateLimitHit(exchange: string): void {
    this.getOrCreateMetric(exchange).rateLimitHits++;
  }
  
  recordBackoff(exchange: string): void {
    this.getOrCreateMetric(exchange).backoffEvents++;
  }
  
  getMetrics(exchange: string): RateLimitMetrics {
    return this.metrics.get(exchange) || this.createEmptyMetric();
  }
}
```

### Health Checks

```typescript
class RateLimitHealthCheck {
  constructor(private monitor: RateLimitMonitor) {}
  
  checkHealth(exchange: string): HealthStatus {
    const metrics = this.monitor.getMetrics(exchange);
    
    if (metrics.rateLimitHits > 10) {
      return { status: 'unhealthy', reason: 'Too many rate limit hits' };
    }
    
    if (metrics.averageResponseTime > 5000) {
      return { status: 'degraded', reason: 'High response times' };
    }
    
    return { status: 'healthy' };
  }
}
```

## Configuration Management

### Environment-based Configuration

```typescript
interface RateLimitEnvironmentConfig {
  aggressive: boolean;        // More aggressive rate limiting
  conservative: boolean;      // More conservative approach
  customLimits: {            // Override default limits
    [exchange: string]: Partial<RateLimitConfig>;
  };
}

class RateLimitConfigManager {
  static getConfig(): RateLimitEnvironmentConfig {
    return {
      aggressive: process.env.CCXT_AGGRESSIVE_RATE_LIMITING === 'true',
      conservative: process.env.CCXT_CONSERVATIVE_RATE_LIMITING === 'true',
      customLimits: JSON.parse(
        process.env.CCXT_CUSTOM_RATE_LIMITS || '{}'
      )
    };
  }
  
  static applyEnvironmentConfig(
    baseConfig: RateLimitConfig,
    envConfig: RateLimitEnvironmentConfig
  ): RateLimitConfig {
    let config = { ...baseConfig };
    
    if (envConfig.aggressive) {
      config.requests *= 1.5;
    }
    
    if (envConfig.conservative) {
      config.requests *= 0.7;
    }
    
    return config;
  }
}
```

## Testing Strategy

### Unit Tests

```typescript
describe('TokenBucket', () => {
  it('should allow requests within capacity', async () => {
    const bucket = new TokenBucket(10, 1);
    
    for (let i = 0; i < 10; i++) {
      const allowed = await bucket.consume();
      expect(allowed).toBe(true);
    }
  });
  
  it('should block requests exceeding capacity', async () => {
    const bucket = new TokenBucket(1, 0.1);
    
    await bucket.consume(); // Should succeed
    
    const start = Date.now();
    await bucket.consume(); // Should wait
    const elapsed = Date.now() - start;
    
    expect(elapsed).toBeGreaterThan(9000); // ~10 seconds
  });
});
```

### Integration Tests

```typescript
describe('Rate Limiting Integration', () => {
  it('should handle exchange rate limits', async () => {
    const exchange = new TestExchange();
    
    // Make requests up to the limit
    for (let i = 0; i < 100; i++) {
      await exchange.fetchTicker('BTC/USDT');
    }
    
    // Next request should be delayed
    const start = Date.now();
    await exchange.fetchTicker('BTC/USDT');
    const elapsed = Date.now() - start;
    
    expect(elapsed).toBeGreaterThan(1000);
  });
});
```

## Future Enhancements

### Machine Learning-based Optimization

- Predict optimal request timing based on historical data
- Dynamic adjustment based on exchange behavior patterns
- Anomaly detection for unusual rate limiting patterns

### Distributed Rate Limiting

- Coordinate rate limits across multiple application instances
- Redis-based distributed token buckets
- Load balancing across API keys

### Advanced Analytics

- Rate limit usage optimization recommendations
- Exchange performance comparisons
- Cost-benefit analysis of different strategies