# Database Design

## Overview

While CCXT is primarily a library for connecting to external APIs, there are scenarios where database storage is beneficial for caching, historical data, configuration management, and performance optimization. This document outlines the database design patterns and schemas used in CCXT-based applications.

## Use Cases

### 1. Market Data Caching
- Cache frequently requested market data
- Reduce API calls and improve response times
- Store historical price data for analysis

### 2. Configuration Management
- Store exchange API credentials securely
- Manage rate limiting configurations
- Store user preferences and settings

### 3. Trading History
- Track orders and trades across exchanges
- Portfolio management and performance analysis
- Compliance and audit trails

### 4. Rate Limiting State
- Persist rate limiting state across application restarts
- Coordinate rate limits across multiple instances
- Track API usage patterns

## Database Technologies

### Recommended Databases

#### Redis (Caching Layer)
```yaml
# Redis configuration for CCXT caching
services:
  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    command: redis-server --appendonly yes
    volumes:
      - redis_data:/data
```

#### PostgreSQL (Persistent Data)
```yaml
# PostgreSQL for persistent storage
services:
  postgres:
    image: postgres:15
    environment:
      POSTGRES_DB: ccxt_data
      POSTGRES_USER: ccxt_user
      POSTGRES_PASSWORD: secure_password
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data
```

#### TimescaleDB (Time Series Data)
```sql
-- Enable TimescaleDB extension
CREATE EXTENSION IF NOT EXISTS timescaledb;

-- Create hypertable for OHLCV data
SELECT create_hypertable('ohlcv_data', 'timestamp');
```

## Schema Design

### 1. Market Data Schema

#### Markets Table
```sql
CREATE TABLE markets (
    id SERIAL PRIMARY KEY,
    exchange VARCHAR(50) NOT NULL,
    symbol VARCHAR(20) NOT NULL,
    base_currency VARCHAR(10) NOT NULL,
    quote_currency VARCHAR(10) NOT NULL,
    active BOOLEAN DEFAULT true,
    type VARCHAR(20) DEFAULT 'spot', -- spot, margin, future, option
    contract_size DECIMAL(20,8),
    expiry_date TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    UNIQUE(exchange, symbol),
    INDEX idx_markets_exchange_symbol (exchange, symbol),
    INDEX idx_markets_currencies (base_currency, quote_currency)
);
```

#### OHLCV Data Table
```sql
CREATE TABLE ohlcv_data (
    id BIGSERIAL,
    exchange VARCHAR(50) NOT NULL,
    symbol VARCHAR(20) NOT NULL,
    timeframe VARCHAR(10) NOT NULL, -- 1m, 5m, 1h, 1d, etc.
    timestamp TIMESTAMP NOT NULL,
    open_price DECIMAL(20,8) NOT NULL,
    high_price DECIMAL(20,8) NOT NULL,
    low_price DECIMAL(20,8) NOT NULL,
    close_price DECIMAL(20,8) NOT NULL,
    volume DECIMAL(20,8) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    PRIMARY KEY (timestamp, exchange, symbol, timeframe),
    FOREIGN KEY (exchange, symbol) REFERENCES markets(exchange, symbol)
);

-- Create hypertable for time series optimization
SELECT create_hypertable('ohlcv_data', 'timestamp');

-- Create indexes for common queries
CREATE INDEX idx_ohlcv_exchange_symbol_timeframe_timestamp 
ON ohlcv_data (exchange, symbol, timeframe, timestamp DESC);
```

#### Ticker Data Table
```sql
CREATE TABLE ticker_data (
    id BIGSERIAL PRIMARY KEY,
    exchange VARCHAR(50) NOT NULL,
    symbol VARCHAR(20) NOT NULL,
    timestamp TIMESTAMP NOT NULL,
    bid_price DECIMAL(20,8),
    ask_price DECIMAL(20,8),
    last_price DECIMAL(20,8),
    high_24h DECIMAL(20,8),
    low_24h DECIMAL(20,8),
    volume_24h DECIMAL(20,8),
    change_24h DECIMAL(10,4),
    change_percent_24h DECIMAL(8,4),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    UNIQUE(exchange, symbol, timestamp),
    FOREIGN KEY (exchange, symbol) REFERENCES markets(exchange, symbol)
);

-- Partition by exchange for better performance
CREATE TABLE ticker_data_binance PARTITION OF ticker_data 
FOR VALUES IN ('binance');

CREATE TABLE ticker_data_coinbase PARTITION OF ticker_data 
FOR VALUES IN ('coinbase');
```

### 2. Trading Data Schema

#### Orders Table
```sql
CREATE TABLE orders (
    id BIGSERIAL PRIMARY KEY,
    external_id VARCHAR(100) NOT NULL, -- Exchange order ID
    exchange VARCHAR(50) NOT NULL,
    symbol VARCHAR(20) NOT NULL,
    order_type VARCHAR(20) NOT NULL, -- market, limit, stop, etc.
    side VARCHAR(10) NOT NULL, -- buy, sell
    amount DECIMAL(20,8) NOT NULL,
    price DECIMAL(20,8),
    filled_amount DECIMAL(20,8) DEFAULT 0,
    remaining_amount DECIMAL(20,8),
    status VARCHAR(20) NOT NULL, -- open, closed, canceled, failed
    fee JSONB, -- Fee structure as JSON
    metadata JSONB, -- Additional exchange-specific data
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    filled_at TIMESTAMP,
    
    UNIQUE(exchange, external_id),
    INDEX idx_orders_exchange_symbol_status (exchange, symbol, status),
    INDEX idx_orders_created_at (created_at DESC),
    FOREIGN KEY (exchange, symbol) REFERENCES markets(exchange, symbol)
);
```

#### Trades Table
```sql
CREATE TABLE trades (
    id BIGSERIAL PRIMARY KEY,
    external_id VARCHAR(100) NOT NULL, -- Exchange trade ID
    order_id BIGINT REFERENCES orders(id),
    exchange VARCHAR(50) NOT NULL,
    symbol VARCHAR(20) NOT NULL,
    side VARCHAR(10) NOT NULL,
    amount DECIMAL(20,8) NOT NULL,
    price DECIMAL(20,8) NOT NULL,
    fee DECIMAL(20,8),
    fee_currency VARCHAR(10),
    timestamp TIMESTAMP NOT NULL,
    is_maker BOOLEAN,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    UNIQUE(exchange, external_id),
    INDEX idx_trades_exchange_symbol_timestamp (exchange, symbol, timestamp DESC),
    INDEX idx_trades_order_id (order_id),
    FOREIGN KEY (exchange, symbol) REFERENCES markets(exchange, symbol)
);
```

### 3. Account Data Schema

#### Balances Table
```sql
CREATE TABLE balances (
    id BIGSERIAL PRIMARY KEY,
    exchange VARCHAR(50) NOT NULL,
    account_id VARCHAR(100) NOT NULL,
    currency VARCHAR(10) NOT NULL,
    total_balance DECIMAL(20,8) NOT NULL,
    available_balance DECIMAL(20,8) NOT NULL,
    reserved_balance DECIMAL(20,8) NOT NULL,
    timestamp TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    UNIQUE(exchange, account_id, currency, timestamp),
    INDEX idx_balances_exchange_account_currency (exchange, account_id, currency),
    INDEX idx_balances_timestamp (timestamp DESC)
);
```

#### API Credentials Table
```sql
CREATE TABLE api_credentials (
    id SERIAL PRIMARY KEY,
    exchange VARCHAR(50) NOT NULL,
    api_key_hash VARCHAR(255) NOT NULL, -- Hashed API key
    encrypted_secret TEXT NOT NULL, -- Encrypted secret
    encrypted_passphrase TEXT, -- Encrypted passphrase if required
    permissions JSONB, -- API key permissions
    is_active BOOLEAN DEFAULT true,
    is_sandbox BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_used_at TIMESTAMP,
    
    UNIQUE(exchange, api_key_hash),
    INDEX idx_credentials_exchange_active (exchange, is_active)
);
```

### 4. Configuration Schema

#### Exchange Configuration Table
```sql
CREATE TABLE exchange_configs (
    id SERIAL PRIMARY KEY,
    exchange VARCHAR(50) NOT NULL,
    config_key VARCHAR(100) NOT NULL,
    config_value JSONB NOT NULL,
    environment VARCHAR(20) DEFAULT 'production', -- dev, staging, production
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    UNIQUE(exchange, config_key, environment),
    INDEX idx_exchange_configs_exchange_env (exchange, environment)
);
```

#### Rate Limiting State Table
```sql
CREATE TABLE rate_limit_state (
    id SERIAL PRIMARY KEY,
    exchange VARCHAR(50) NOT NULL,
    endpoint VARCHAR(200),
    tokens_available INTEGER NOT NULL,
    last_refill TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    UNIQUE(exchange, endpoint),
    INDEX idx_rate_limit_exchange (exchange)
);
```

## Caching Strategy

### Redis Cache Schema

#### Market Data Caching
```typescript
// Cache keys pattern
const CACHE_KEYS = {
  ticker: (exchange: string, symbol: string) => 
    `ticker:${exchange}:${symbol}`,
  orderbook: (exchange: string, symbol: string, limit: number) => 
    `orderbook:${exchange}:${symbol}:${limit}`,
  markets: (exchange: string) => 
    `markets:${exchange}`,
  ohlcv: (exchange: string, symbol: string, timeframe: string) => 
    `ohlcv:${exchange}:${symbol}:${timeframe}`
};

// Cache TTL configuration
const CACHE_TTL = {
  ticker: 10,        // 10 seconds
  orderbook: 5,      // 5 seconds  
  markets: 3600,     // 1 hour
  ohlcv: 60          // 1 minute
};
```

#### Implementation Example
```typescript
class MarketDataCache {
  constructor(private redis: Redis) {}
  
  async getTicker(exchange: string, symbol: string): Promise<Ticker | null> {
    const key = CACHE_KEYS.ticker(exchange, symbol);
    const cached = await this.redis.get(key);
    
    if (cached) {
      return JSON.parse(cached);
    }
    
    return null;
  }
  
  async setTicker(
    exchange: string, 
    symbol: string, 
    ticker: Ticker
  ): Promise<void> {
    const key = CACHE_KEYS.ticker(exchange, symbol);
    await this.redis.setex(
      key, 
      CACHE_TTL.ticket, 
      JSON.stringify(ticker)
    );
  }
  
  async invalidateMarket(exchange: string, symbol: string): Promise<void> {
    const patterns = [
      CACHE_KEYS.ticker(exchange, symbol),
      CACHE_KEYS.orderbook(exchange, symbol, '*'),
      CACHE_KEYS.ohlcv(exchange, symbol, '*')
    ];
    
    for (const pattern of patterns) {
      const keys = await this.redis.keys(pattern);
      if (keys.length > 0) {
        await this.redis.del(...keys);
      }
    }
  }
}
```

## Data Access Layer

### Repository Pattern Implementation

```typescript
interface MarketRepository {
  findByExchangeAndSymbol(exchange: string, symbol: string): Promise<Market>;
  findByExchange(exchange: string): Promise<Market[]>;
  save(market: Market): Promise<Market>;
  update(id: number, updates: Partial<Market>): Promise<Market>;
}

class PostgreSQLMarketRepository implements MarketRepository {
  constructor(private db: Pool) {}
  
  async findByExchangeAndSymbol(
    exchange: string, 
    symbol: string
  ): Promise<Market> {
    const query = `
      SELECT * FROM markets 
      WHERE exchange = $1 AND symbol = $2 AND active = true
    `;
    
    const result = await this.db.query(query, [exchange, symbol]);
    
    if (result.rows.length === 0) {
      throw new Error(`Market ${exchange}:${symbol} not found`);
    }
    
    return this.mapRowToMarket(result.rows[0]);
  }
  
  private mapRowToMarket(row: any): Market {
    return {
      id: row.id,
      exchange: row.exchange,
      symbol: row.symbol,
      baseCurrency: row.base_currency,
      quoteCurrency: row.quote_currency,
      active: row.active,
      type: row.type,
      contractSize: row.contract_size,
      expiryDate: row.expiry_date,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }
}
```

### Query Optimization

#### Efficient OHLCV Queries
```sql
-- Query for recent OHLCV data with proper indexing
EXPLAIN ANALYZE
SELECT 
    timestamp,
    open_price,
    high_price,
    low_price,
    close_price,
    volume
FROM ohlcv_data
WHERE 
    exchange = 'binance'
    AND symbol = 'BTC/USDT'
    AND timeframe = '1h'
    AND timestamp >= NOW() - INTERVAL '24 hours'
ORDER BY timestamp DESC
LIMIT 24;

-- Result should use index scan, not sequential scan
-- Index Scan using idx_ohlcv_exchange_symbol_timeframe_timestamp
```

#### Aggregate Queries
```sql
-- Daily volume aggregation
SELECT 
    DATE(timestamp) as date,
    SUM(volume) as total_volume,
    AVG(close_price) as avg_price,
    MAX(high_price) as day_high,
    MIN(low_price) as day_low
FROM ohlcv_data
WHERE 
    exchange = 'binance'
    AND symbol = 'BTC/USDT'
    AND timeframe = '1h'
    AND timestamp >= CURRENT_DATE - INTERVAL '30 days'
GROUP BY DATE(timestamp)
ORDER BY date DESC;
```

## Backup and Recovery

### Backup Strategy
```bash
#!/bin/bash
# Database backup script

# PostgreSQL backup
pg_dump -h localhost -U ccxt_user ccxt_data > backup_$(date +%Y%m%d_%H%M%S).sql

# Redis backup
redis-cli --rdb backup_redis_$(date +%Y%m%d_%H%M%S).rdb

# Compress and upload to S3
tar -czf backup_$(date +%Y%m%d_%H%M%S).tar.gz *.sql *.rdb
aws s3 cp backup_$(date +%Y%m%d_%H%M%S).tar.gz s3://ccxt-backups/
```

### Point-in-Time Recovery
```sql
-- PostgreSQL point-in-time recovery
-- Enable WAL archiving in postgresql.conf
archive_mode = on
archive_command = 'cp %p /path/to/archive/%f'

-- Create base backup
SELECT pg_start_backup('backup_label');
-- Copy data directory
SELECT pg_stop_backup();

-- Recovery configuration
restore_command = 'cp /path/to/archive/%f %p'
recovery_target_time = '2023-12-01 10:30:00'
```

## Monitoring and Maintenance

### Database Monitoring
```sql
-- Query performance monitoring
SELECT 
    query,
    calls,
    total_time,
    mean_time,
    rows
FROM pg_stat_statements
ORDER BY total_time DESC
LIMIT 10;

-- Index usage statistics
SELECT 
    schemaname,
    tablename,
    indexname,
    idx_scan,
    idx_tup_read,
    idx_tup_fetch
FROM pg_stat_user_indexes
ORDER BY idx_scan DESC;
```

### Maintenance Tasks
```sql
-- Regular maintenance tasks
VACUUM ANALYZE ohlcv_data;
REINDEX TABLE ohlcv_data;

-- Partition maintenance for old data
DROP TABLE IF EXISTS ohlcv_data_old;
CREATE TABLE ohlcv_data_old AS 
SELECT * FROM ohlcv_data 
WHERE timestamp < NOW() - INTERVAL '1 year';

DELETE FROM ohlcv_data 
WHERE timestamp < NOW() - INTERVAL '1 year';
```

## Security Considerations

### Data Encryption
```sql
-- Encrypt sensitive columns
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Store encrypted API secrets
INSERT INTO api_credentials (
    exchange,
    api_key_hash,
    encrypted_secret
) VALUES (
    'binance',
    digest('api_key_value', 'sha256'),
    pgp_sym_encrypt('secret_value', 'encryption_key')
);
```

### Access Control
```sql
-- Create read-only user for reporting
CREATE USER ccxt_readonly WITH PASSWORD 'readonly_password';
GRANT CONNECT ON DATABASE ccxt_data TO ccxt_readonly;
GRANT USAGE ON SCHEMA public TO ccxt_readonly;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO ccxt_readonly;

-- Create application user with limited permissions
CREATE USER ccxt_app WITH PASSWORD 'app_password';
GRANT CONNECT ON DATABASE ccxt_data TO ccxt_app;
GRANT USAGE ON SCHEMA public TO ccxt_app;
GRANT SELECT, INSERT, UPDATE ON orders, trades, balances TO ccxt_app;
GRANT SELECT ON markets TO ccxt_app;
```

## Migration Strategy

### Schema Versioning
```typescript
interface Migration {
  version: string;
  description: string;
  up: (db: Pool) => Promise<void>;
  down: (db: Pool) => Promise<void>;
}

class MigrationRunner {
  async runMigrations(migrations: Migration[]): Promise<void> {
    for (const migration of migrations) {
      const applied = await this.isMigrationApplied(migration.version);
      
      if (!applied) {
        await migration.up(this.db);
        await this.recordMigration(migration);
      }
    }
  }
}
```