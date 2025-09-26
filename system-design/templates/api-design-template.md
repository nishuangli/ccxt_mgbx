# API Design: [API Name]

## Overview

Brief description of the API and its purpose.

## Design Principles

- RESTful design
- Consistent naming conventions
- Proper HTTP status codes
- Clear error messages

## Base Information

- **Base URL**: `https://api.example.com/v1`
- **Protocol**: HTTP/HTTPS
- **Authentication**: Bearer token / API key
- **Content Type**: `application/json`

## Authentication

### Bearer Token
```http
Authorization: Bearer <token>
```

### API Key
```http
X-API-Key: <api-key>
```

## Endpoints

### [Resource Name]

#### List Resources
```http
GET /resources
```

**Parameters:**
- `limit` (optional): Number of items per page (default: 20, max: 100)
- `offset` (optional): Number of items to skip (default: 0)
- `sort` (optional): Sort field and direction (e.g., `created_at:desc`)
- `filter` (optional): Filter criteria

**Response:**
```json
{
  "data": [
    {
      "id": "resource-123",
      "name": "Resource Name",
      "created_at": "2023-01-01T00:00:00Z",
      "updated_at": "2023-01-01T00:00:00Z"
    }
  ],
  "pagination": {
    "limit": 20,
    "offset": 0,
    "total": 100,
    "has_more": true
  }
}
```

#### Get Resource
```http
GET /resources/{id}
```

**Parameters:**
- `id` (required): Resource identifier

**Response:**
```json
{
  "id": "resource-123",
  "name": "Resource Name",
  "description": "Resource description",
  "status": "active",
  "created_at": "2023-01-01T00:00:00Z",
  "updated_at": "2023-01-01T00:00:00Z"
}
```

#### Create Resource
```http
POST /resources
```

**Request Body:**
```json
{
  "name": "New Resource",
  "description": "Resource description",
  "config": {
    "setting1": "value1",
    "setting2": "value2"
  }
}
```

**Response:**
```json
{
  "id": "resource-456",
  "name": "New Resource",
  "description": "Resource description",
  "status": "pending",
  "created_at": "2023-01-01T12:00:00Z",
  "updated_at": "2023-01-01T12:00:00Z"
}
```

#### Update Resource
```http
PUT /resources/{id}
PATCH /resources/{id}
```

**Request Body (PUT - full update):**
```json
{
  "name": "Updated Resource",
  "description": "Updated description",
  "status": "active"
}
```

**Request Body (PATCH - partial update):**
```json
{
  "status": "inactive"
}
```

#### Delete Resource
```http
DELETE /resources/{id}
```

**Response:**
```http
204 No Content
```

## Data Models

### Resource Model
```typescript
interface Resource {
  id: string;
  name: string;
  description?: string;
  status: 'active' | 'inactive' | 'pending';
  config: Record<string, any>;
  created_at: string; // ISO 8601
  updated_at: string; // ISO 8601
}
```

### Error Model
```typescript
interface ErrorResponse {
  error: {
    code: string;
    message: string;
    details?: Record<string, any>;
  };
  request_id: string;
}
```

## HTTP Status Codes

- `200 OK` - Successful GET, PUT, PATCH
- `201 Created` - Successful POST
- `204 No Content` - Successful DELETE
- `400 Bad Request` - Invalid request data
- `401 Unauthorized` - Authentication required
- `403 Forbidden` - Insufficient permissions
- `404 Not Found` - Resource not found
- `409 Conflict` - Resource conflict
- `422 Unprocessable Entity` - Validation errors
- `429 Too Many Requests` - Rate limit exceeded
- `500 Internal Server Error` - Server error

## Error Handling

### Error Response Format
```json
{
  "error": {
    "code": "RESOURCE_NOT_FOUND",
    "message": "The requested resource was not found",
    "details": {
      "resource_id": "resource-123"
    }
  },
  "request_id": "req-456"
}
```

### Common Error Codes
- `INVALID_REQUEST` - Malformed request
- `AUTHENTICATION_REQUIRED` - Missing authentication
- `INSUFFICIENT_PERMISSIONS` - Access denied
- `RESOURCE_NOT_FOUND` - Resource doesn't exist
- `VALIDATION_ERROR` - Input validation failed
- `RATE_LIMIT_EXCEEDED` - Too many requests

## Rate Limiting

- Rate limit: 1000 requests per hour per API key
- Burst limit: 100 requests per minute
- Headers returned:
  - `X-RateLimit-Limit`: Request limit per hour
  - `X-RateLimit-Remaining`: Remaining requests
  - `X-RateLimit-Reset`: Time when limit resets

## Versioning

- URL versioning: `/v1/`, `/v2/`
- Backward compatibility maintained for at least 12 months
- Deprecation notices provided 6 months in advance

## Security

### HTTPS Only
All API endpoints must use HTTPS.

### Input Validation
- Request body size limits
- Parameter validation
- SQL injection prevention
- XSS protection

### Output Sanitization
- Remove sensitive data from responses
- Consistent data formatting

## Testing

### Test Coverage
- Unit tests for all endpoints
- Integration tests for workflows
- Load testing for performance
- Security testing for vulnerabilities

### Mock Data
Provide mock data for development and testing.

## Documentation

### Interactive Documentation
- Swagger/OpenAPI specification
- Try-it-out functionality
- Code examples in multiple languages

### SDK Support
- JavaScript/TypeScript SDK
- Python SDK
- Go SDK
- PHP SDK

## Monitoring

### Metrics
- Request volume
- Response times
- Error rates
- Authentication failures

### Logging
- Request/response logging
- Error logging
- Performance logging
- Security event logging