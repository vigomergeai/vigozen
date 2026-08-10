# Employee Data Transfer & Subordinate Viewing System

## Overview
This implementation provides functionality to transfer all data from a leaving employee to another employee, and allows managers to view their subordinates' information in the user panel.

## Features

### 1. Employee Data Transfer
When an employee leaves the organization, all their associated data can be transferred to another employee with a single API call.

**Transferred Data:**
- Leads (owned by the leaving employee)
- Deals (owned by the leaving employee)
- Tasks (assigned to/assigned by the leaving employee)
- Tickets (owned by/assigned to the leaving employee)
- Activities (related to the leaving employee's deals)
- Calendar Events (created by the leaving employee)
- Integrations (configured by the leaving employee)
- Lead Comments (preserved with original user names for historical accuracy)

**Audit & Notifications:**
- All transfers are logged in the `audit_logs` table
- The target employee receives a notification with transfer summary
- Company-wide audit trail maintained

### 2. Subordinate Viewing
Managers can view their team members' information through dedicated endpoints.

**Available Information:**
- Subordinate list with full user details
- Team statistics (total members, active/inactive counts, role distribution, department distribution)
- Hierarchical team structure (recursive reporting lines)

## API Endpoints

### Employee Data Transfer

#### POST /users/transfer-data
Transfer all data from a leaving employee to a target employee.

**Authentication:** Required (Admin, Sales Manager, Lead Manager, Team Leader)

**Request Body:**
```json
{
  "leaving_user_id": "uuid-of-leaving-employee",
  "target_user_id": "uuid-of-target-employee"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Successfully transferred data from John Doe to Jane Smith",
  "from_user": {
    "id": "uuid",
    "name": "John Doe",
    "email": "john@example.com"
  },
  "to_user": {
    "id": "uuid",
    "name": "Jane Smith",
    "email": "jane@example.com"
  },
  "transfer_summary": {
    "leads": 15,
    "deals": 8,
    "tasks": 23,
    "tickets": 5,
    "activities": 12,
    "calendar_events": 7,
    "comments": 45,
    "integrations": 3
  }
}
```

**Permissions:**
- Super Admin: Can transfer any user's data
- Org Admin: Can transfer data within their company
- Sales Manager: Can transfer data from/to their subordinates
- Lead Manager: Can transfer data from/to their subordinates

### Subordinate Viewing

#### GET /users/my-subordinates
Get all subordinates of the currently logged-in user.

**Authentication:** Required

**Response:**
```json
[
  {
    "id": "uuid",
    "name": "Jane Smith",
    "email": "jane@example.com",
    "role": "Sales Executive",
    "department": "Sales",
    "manager_id": "uuid-of-manager",
    "team_id": "uuid-of-team",
    "is_active": true,
    "status": "Active",
    "created_at": "2024-01-15T10:30:00Z",
    "employee_id": "EMP001",
    "avatar_url": "/uploads/avatars/avatar-123.jpg",
    "trial_start": "2024-01-15T10:30:00Z",
    "trial_end": "2024-01-18T10:30:00Z",
    "subscription_status": "trialing",
    "plan_type": "trial",
    "payment_status": "unpaid"
  }
]
```

#### GET /users/:managerId/subordinates
Get subordinates of a specific manager (Admin only).

**Authentication:** Required (Admin/Super Admin only)

**Response:** Same as above

#### GET /users/my-team-stats
Get team statistics for the current user.

**Authentication:** Required

**Response:**
```json
{
  "total_members": 12,
  "active_members": 10,
  "inactive_members": 2,
  "by_role": {
    "Sales Executive": 8,
    "Team Leader": 2,
    "Sales Manager": 1
  },
  "by_department": {
    "Sales": 10,
    "Marketing": 2
  }
}
```

#### GET /users/:managerId/team-stats
Get team statistics for a specific manager (Admin only).

**Authentication:** Required (Admin/Super Admin only)

**Response:** Same as above

## Implementation Details

### File Structure
```
server/
├── employeeTransfer.js    # Core business logic for data transfer and subordinate queries
└── server.js              # API routes (updated with new endpoints)
```

### Database Schema Requirements

The system uses the existing `users` table with the following relevant fields:
- `id` (UUID) - Primary key
- `name` (VARCHAR) - User's full name
- `email` (VARCHAR) - User's email
- `role` (VARCHAR) - User's role (Sales Executive, Team Leader, Sales Manager, etc.)
- `department` (VARCHAR) - User's department
- `manager_id` (UUID) - Foreign key to user's manager
- `team_id` (UUID) - Foreign key to user's team
- `is_active` (BOOLEAN) - Active status
- `status` (VARCHAR) - Account status
- `employee_id` (VARCHAR) - Employee ID
- `company_id` (UUID) - Foreign key to company

**Hierarchical Query:**
The system uses a recursive CTE (Common Table Expression) to fetch the entire hierarchy:
```sql
WITH RECURSIVE subordinates AS (
  -- Start with the manager
  SELECT id FROM users WHERE id = $1
  UNION
  -- Add all team members
  SELECT id FROM users WHERE team_id = $2
  UNION ALL
  -- Recursively find all subordinates
  SELECT u.id FROM users u
  INNER JOIN subordinates s ON u.manager_id = s.id
)
SELECT DISTINCT id FROM subordinates
```

### Data Transfer Logic

The `transferEmployeeData` function performs the following operations in a single transaction:

1. **Verification:** Validates both users exist
2. **Leads Transfer:** Updates `owner_id` from leaving user to target user
3. **Deals Transfer:** Updates `owner_id` from leaving user to target user
4. **Tasks Transfer:** Updates both `assigned_to` and `assigned_by` fields
5. **Tickets Transfer:** Updates both `owner_id` and `assigned_to` fields
6. **Activities Transfer:** Updates activities through deal ownership
7. **Calendar Events Transfer:** Updates `created_by` field
8. **Integrations Transfer:** Updates `user_id` field
9. **Audit Logging:** Records the transfer in audit_logs
10. **Notifications:** Sends notification to target user with summary

### Security & Permissions

**Role-Based Access Control:**
- **Super Admin:** Full access to all transfer operations
- **Org Admin:** Can transfer users within their company
- **Sales Manager:** Can transfer data from/to their subordinates (Sales Executives, Team Leaders)
- **Lead Manager:** Can transfer data from/to their subordinates (Lead Executives, Telecallers, Lead Qualifiers)

**Access Validation:**
The system uses `checkUserManagementAccess` to verify:
1. The current user has permission to manage the leaving user
2. The current user has permission to manage the target user
3. The reporting structure is valid (hierarchical rules)

### Audit Trail

All data transfers are logged in the `audit_logs` table with:
- User who performed the transfer
- Timestamp
- Action type: 'TRANSFER'
- Entity type: 'user'
- Changes: JSON object containing from_user, to_user, and transfer_summary

## Usage Examples

### Example 1: Transfer Employee Data

**Request:**
```bash
POST /users/transfer-data
Headers:
  Authorization: Bearer <token>
  Content-Type: application/json

Body:
{
  "leaving_user_id": "123e4567-e89b-12d3-a456-426614174000",
  "target_user_id": "123e4567-e89b-12d3-a456-426614174001"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Successfully transferred data from John Doe to Jane Smith",
  "from_user": {
    "id": "123e4567-e89b-12d3-a456-426614174000",
    "name": "John Doe",
    "email": "john@example.com"
  },
  "to_user": {
    "id": "123e4567-e89b-12d3-a456-426614174001",
    "name": "Jane Smith",
    "email": "jane@example.com"
  },
  "transfer_summary": {
    "leads": 15,
    "deals": 8,
    "tasks": 23,
    "tickets": 5,
    "activities": 12,
    "calendar_events": 7,
    "comments": 45,
    "integrations": 3
  }
}
```

### Example 2: Get Subordinates

**Request:**
```bash
GET /users/my-subordinates
Headers:
  Authorization: Bearer <token>
```

**Response:**
```json
[
  {
    "id": "123e4567-e89b-12d3-a456-426614174002",
    "name": "Alice Johnson",
    "email": "alice@example.com",
    "role": "Team Leader",
    "department": "Sales",
    "manager_id": "123e4567-e89b-12d3-a456-426614174000",
    "team_id": "123e4567-e89b-12d3-a456-426614174010",
    "is_active": true,
    "status": "Active",
    "employee_id": "EMP002"
  },
  {
    "id": "123e4567-e89b-12d3-a456-426614174003",
    "name": "Bob Williams",
    "email": "bob@example.com",
    "role": "Sales Executive",
    "department": "Sales",
    "manager_id": "123e4567-e89b-12d3-a456-426614174000",
    "team_id": "123e4567-e89b-12d3-a456-426614174010",
    "is_active": true,
    "status": "Active",
    "employee_id": "EMP003"
  }
]
```

### Example 3: Get Team Statistics

**Request:**
```bash
GET /users/my-team-stats
Headers:
  Authorization: Bearer <token>
```

**Response:**
```json
{
  "total_members": 12,
  "active_members": 10,
  "inactive_members": 2,
  "by_role": {
    "Sales Executive": 8,
    "Team Leader": 2,
    "Sales Manager": 1
  },
  "by_department": {
    "Sales": 10,
    "Marketing": 2
  }
}
```

## Testing

### Prerequisites
1. Ensure the database is running and accessible
2. Ensure at least one admin user exists
3. Ensure users have proper hierarchical relationships (manager_id, team_id)

### Test Scenarios

1. **Test Data Transfer:**
   - Create a manager with subordinates
   - Create leads, deals, tasks, tickets for a subordinate
   - Transfer the subordinate's data to another team member
   - Verify all data is transferred correctly
   - Check audit logs for the transfer record

2. **Test Subordinate Viewing:**
   - Login as a manager
   - Call `/users/my-subordinates`
   - Verify all subordinates are returned
   - Check team statistics endpoint

3. **Test Permissions:**
   - Try to transfer data as a non-manager (should fail)
   - Try to view another manager's subordinates (should fail for non-admins)
   - Verify admin can view all subordinates

## Error Handling

**Common Errors:**
- `400 Bad Request`: Missing required parameters or invalid user IDs
- `401 Unauthorized`: Missing or invalid authentication token
- `403 Forbidden`: Insufficient permissions to perform the action
- `404 Not Found`: User not found
- `500 Internal Server Error`: Database or server error

**Error Response Format:**
```json
{
  "error": "Error description",
  "details": "Additional error details (if any)"
}
```

## Best Practices

1. **Before Transfer:**
   - Verify the leaving employee's data is complete
   - Choose an appropriate target employee (same department/team recommended)
   - Inform both parties about the transfer

2. **During Transfer:**
   - The system maintains data integrity
   - All foreign key relationships are preserved
   - Historical data (comments, activities) retains original user names

3. **After Transfer:**
   - Verify the transfer summary
   - Notify the target employee to review transferred items
   - Update any external systems or integrations if needed
   - Deactivate or delete the leaving employee's account

## Maintenance

### Monitoring
- Monitor audit logs for transfer activities
- Check notification delivery status
- Review team statistics regularly

### Cleanup
- After transfer, consider deactivating the leaving employee's account
- Review and clean up any orphaned records
- Archive old data if needed

## Support

For issues or questions:
1. Check the audit_logs table for transfer history
2. Verify user permissions and roles
3. Check database constraints and relationships
4. Review application logs for errors

## Future Enhancements

Potential improvements:
1. Email notifications to all stakeholders
2. Transfer preview before execution
3. Partial data transfer (selective items)
4. Scheduled transfers (for future dates)
5. Transfer templates for common scenarios
6. Bulk transfer for multiple employees
7. Integration with HR systems for automated offboarding