# How to Test the Notifications Endpoint

## The Issue

The endpoint `http://localhost:3000/api/notifications` **IS WORKING** but it requires **authentication** (JWT token).

When you try to access it without authentication, you get:
```
{"error":"Authentication required"}
```

This is the correct behavior! The endpoint is protected by the `authMiddleware`.

---

## Solution: How to Test the Endpoint

### Method 1: Get a JWT Token First

1. **Login to get a token:**
```bash
POST http://localhost:3000/api/auth/login
Content-Type: application/json

{
  "email": "your-email@example.com",
  "password": "your-password"
}
```

**Response:**
```json
{
  "status": "success",
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "user": {
      ...
    }
  }
}
```

2. **Use the token to access notifications:**
```bash
GET http://localhost:3000/api/notifications
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

---

### Method 2: Using cURL

```bash
# Step 1: Login and save token
TOKEN=$(curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"your-email@example.com","password":"your-password"}' \
  | jq -r '.data.token')

# Step 2: Use token to get notifications
curl -X GET http://localhost:3000/api/notifications \
  -H "Authorization: Bearer $TOKEN"
```

---

### Method 3: Using Postman

1. **Create a new request**
   - Method: `GET`
   - URL: `http://localhost:3000/api/notifications`

2. **Add Authorization Header**
   - Go to "Authorization" tab
   - Type: "Bearer Token"
   - Token: `<paste-your-jwt-token-here>`

3. **Send Request**

---

### Method 4: Using JavaScript/Fetch

```javascript
// Step 1: Login
const loginResponse = await fetch('http://localhost:3000/api/auth/login', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    email: 'your-email@example.com',
    password: 'your-password'
  })
});

const loginData = await loginResponse.json();
const token = loginData.data.token;

// Step 2: Get notifications
const notificationsResponse = await fetch('http://localhost:3000/api/notifications', {
  headers: {
    'Authorization': `Bearer ${token}`
  }
});

const notifications = await notificationsResponse.json();
console.log(notifications);
```

---

## Testing Without Authentication (For Development Only)

If you want to test without authentication temporarily, you can create a test route:

### Option A: Add a Test Route (Temporary)

Add this to `src/routes/notification.route.js`:

```javascript
// TEMPORARY TEST ROUTE - REMOVE IN PRODUCTION
router.get('/test-no-auth', async (req, res) => {
  try {
    const notifications = await prisma.notification.findMany({
      where: {
        isDeleted: false
      },
      orderBy: {
        createdAt: 'desc'
      },
      take: 10
    });

    res.json({
      status: 'success',
      data: notifications,
      message: 'Test route - no auth required'
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
});
```

Then access:
```
http://localhost:3000/api/notifications/test-no-auth
```

**⚠️ WARNING: Remove this test route before deploying to production!**

---

## Verify Endpoint is Working

### Check 1: Server Logs

When you start the server, you should see:
```
Server running on port 3000
✅ Notification route registered at /api/notifications
✅ Notification cron job started - running every 5 minutes
```

### Check 2: Test with Wrong Token

```bash
curl -X GET http://localhost:3000/api/notifications \
  -H "Authorization: Bearer invalid-token"
```

**Expected Response:**
```json
{
  "error": "Invalid token"
}
```

This confirms the endpoint exists and authentication is working.

### Check 3: Test with No Token

```bash
curl -X GET http://localhost:3000/api/notifications
```

**Expected Response:**
```json
{
  "error": "Authentication required"
}
```

---

## Common Issues

### Issue 1: "Cannot GET /api/notifications"

**Cause:** Route not registered or server not running

**Solution:**
1. Check server logs for: `✅ Notification route registered`
2. Restart the server: `npm run dev`
3. Verify server is running on correct port

### Issue 2: "Authentication required"

**Cause:** No token provided (THIS IS NORMAL!)

**Solution:**
- Get a JWT token by logging in first
- Add `Authorization: Bearer <token>` header

### Issue 3: "Invalid token" or "Token expired"

**Cause:** Token is invalid or expired

**Solution:**
- Login again to get a new token
- Check token expiry settings in your auth configuration

### Issue 4: Empty results array

**Cause:** No notifications exist for your user

**Solution:**
- Create a test notification using the cron job
- Create a calendar task due in 30 minutes
- Wait for cron job to run (every 2 minutes)
- Check notifications again

---

## Create Test Notifications

### Method 1: Use the Cron Job

1. Create a calendar task due in 30 minutes:
```bash
POST http://localhost:3000/api/calendar/tasks
Authorization: Bearer <your-token>
Content-Type: application/json

{
  "title": "Test Meeting",
  "description": "Test task for notifications",
  "dueDate": "2026-01-07T10:30:00.000Z",  # 30 minutes from now
  "status": "pending",
  "priority": "high"
}
```

2. Wait 2 minutes for cron job to run

3. Check notifications:
```bash
GET http://localhost:3000/api/notifications
Authorization: Bearer <your-token>
```

### Method 2: Create Directly in Database

```sql
INSERT INTO notifications (id, type, title, description, priority, "taskId", "userId", "isRead", "isActionDone", "isDeleted", "createdAt", "updatedAt")
VALUES (
  'test-notif-' || gen_random_uuid(),
  'calendarTask',
  'Test Notification',
  'This is a test notification',
  'high',
  NULL,
  'your-user-id-here',  -- Replace with your user ID
  false,
  false,
  false,
  NOW(),
  NOW()
);
```

Then fetch:
```bash
GET http://localhost:3000/api/notifications
Authorization: Bearer <your-token>
```

---

## Summary

✅ **The endpoint IS working!**
✅ It requires authentication (this is correct behavior)
✅ You need to login first to get a JWT token
✅ Then use that token in the Authorization header

**Test command:**
```bash
# Replace with your actual token
curl -X GET http://localhost:3000/api/notifications \
  -H "Authorization: Bearer YOUR_JWT_TOKEN_HERE"
```

---

## Quick Test Script

Save this as `test-notifications.sh`:

```bash
#!/bin/bash

# Configuration
API_URL="http://localhost:3000"
EMAIL="your-email@example.com"
PASSWORD="your-password"

# Login
echo "Logging in..."
TOKEN=$(curl -s -X POST "$API_URL/api/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}" \
  | jq -r '.data.token')

if [ "$TOKEN" == "null" ] || [ -z "$TOKEN" ]; then
  echo "❌ Login failed"
  exit 1
fi

echo "✅ Logged in successfully"
echo "Token: ${TOKEN:0:20}..."

# Get notifications
echo ""
echo "Fetching notifications..."
curl -s -X GET "$API_URL/api/notifications" \
  -H "Authorization: Bearer $TOKEN" \
  | jq '.'
```

Make it executable and run:
```bash
chmod +x test-notifications.sh
./test-notifications.sh
```
