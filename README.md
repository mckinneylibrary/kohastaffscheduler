# 📂 kohastaffschedule

A native staff scheduling plugin for the **Koha ILS** (Integrated Library System).

---

## 📖 Overview

**kohastaffschedule** is a staff scheduling solution that operates entirely within Koha's native MariaDB database. Instead of relying on external dependencies or standalone tools, this plugin integrates directly with Koha's borrower records and branch infrastructure, keeping all scheduling data in a single source of truth.

**Key benefit**: No external databases, APIs, or third-party services required. Everything stays within your Koha installation.

---

## ✨ Key Features

- **Native Integration**: Operates directly with Koha's `borrowers` and `branches` tables
- **Weekly Calendar View**: Intuitive week-by-week scheduling interface
- **Branch Assignment**: Assign staff to specific branches (or mark as "Out")
- **Admin Mode**: Authorized staff can create, view, and delete shifts
- **View-Only Mode**: Staff can view their own schedule
- **Real-time Updates**: Changes reflected immediately via REST API
- **Permission-Based Access**: Uses Koha's permission system for role-based control

---

## 🛠 Technical Architecture

### Backend
- **Language**: Perl (using `Koha::Plugins::Base`)
- **Database**: Native MariaDB tables (`plugin_ks_assignments`)
- **Routes**: REST API endpoints registered via `api_routes()` hook

### Frontend
- **Framework**: Vanilla JavaScript (no build step required)
- **Bundle**: Single `bundle.js` file (~8KB minified)
- **Template**: Koha Template Toolkit (`.tt` files)
- **Styling**: Inline CSS scoped to `#schedule-root`

### Data Flow
```
User Dashboard (dashboard.tt)
    ↓
window.KohaScheduleConfig (branches, staff, admin flag)
    ↓
bundle.js (Client-side state management)
    ↓
REST API (/api/v1/contrib/kohastaffschedule/assignments)
    ↓
routes.pl (Validation, permission checks)
    ↓
MariaDB (plugin_ks_assignments table)
```

---

## 🚀 Installation & Setup

### Prerequisites
- Koha 22.11 or later
- Admin access to Koha Administration interface
- Ability to create/upload plugin packages

### Step 1: Package the Plugin

Clone or download the repository, then zip the `Koha/` directory:

```bash
zip -r kohastaffschedule.kpz Koha/
```

This creates a Koha Plugin Archive (`.kpz` file) containing all plugin code.

### Step 2: Upload to Koha

1. Log in to Koha with **admin credentials**
2. Navigate to **Administration** → **Manage Plugins**
3. Click **"Upload plugin"**
4. Select `kohastaffschedule.kpz`
5. Click **Upload**

Koha will:
- Extract the plugin
- Run the `install()` method to create the `plugin_ks_assignments` table
- Register the REST API routes

### Step 3: Launch the Dashboard

1. In the Plugins page, find **"Koha Staff Schedule"**
2. Click **"Run tool"** (or navigate to `/cgi-bin/koha/plugins/run.pl?class=Koha::Plugin::Com::McKinneyLibrary::kohastaffschedule&method=tool`)
3. The scheduling dashboard should load with your branches and staff list

### Step 4: Configure Permissions

To allow staff to create/edit shifts (Admin Mode):

1. Go to **Administration** → **Patron Types & Categories** → **Define Permissions**
2. Create or update a permission for `staffing > manage_staffing`
3. Assign this permission to appropriate staff members

Currently, the plugin checks for `superlibrarian` permissions. Update `kohastaffschedule.pm` line 65 to use your custom permission:

```perl
my $user_perms = haspermission($userid, { 'staffing' => 'manage_staffing' });
```

---

## 📋 Database Schema

The plugin creates a single table:

```sql
CREATE TABLE plugin_ks_assignments (
    id INT AUTO_INCREMENT PRIMARY KEY,
    borrowernumber INT NOT NULL,
    branchcode VARCHAR(10) NOT NULL,
    shift_date DATE NOT NULL,
    start_time TIME,
    end_time TIME,
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (borrowernumber) REFERENCES borrowers(borrowernumber) ON DELETE CASCADE,
    FOREIGN KEY (branchcode) REFERENCES branches(branchcode) ON DELETE CASCADE,
    INDEX idx_date (shift_date),
    INDEX idx_borrower (borrowernumber),
    INDEX idx_branch (branchcode)
);
```

**Columns**:
- `borrowernumber`: Staff member (from `borrowers` table)
- `branchcode`: Assigned branch (from `branches` table, or special "OUT" value)
- `shift_date`: Date of the shift (YYYY-MM-DD)
- `start_time`: Shift start time (HH:MM, optional)
- `end_time`: Shift end time (HH:MM, optional)
- `notes`: Free-text notes (optional)
- `created_at` / `updated_at`: Audit timestamps

---

## 🔌 API Documentation

The plugin exposes REST endpoints at `/api/v1/contrib/kohastaffschedule/assignments`

### GET /assignments

**Fetch shifts for a date range**

```bash
GET /api/v1/contrib/kohastaffschedule/assignments?from=2026-05-20&to=2026-05-26
```

**Parameters**:
- `from` (required): Start date (YYYY-MM-DD)
- `to` (required): End date (YYYY-MM-DD)

**Response** (200 OK):
```json
[
  {
    "id": 1,
    "borrowernumber": 42,
    "branchcode": "MAIN",
    "shift_date": "2026-05-21",
    "start_time": "09:00:00",
    "end_time": "17:00:00",
    "notes": "Opening shift"
  }
]
```

---

### POST /assignments

**Create a new shift**

```bash
POST /api/v1/contrib/kohastaffschedule/assignments
Content-Type: application/json

{
  "borrowernumber": 42,
  "branchcode": "MAIN",
  "shift_date": "2026-05-21",
  "start_time": "09:00",
  "end_time": "17:00",
  "notes": "Opening shift"
}
```

**Fields**:
- `borrowernumber` (required): Valid borrower ID
- `branchcode` (required): Valid branch code or "OUT"
- `shift_date` (required): Date (YYYY-MM-DD)
- `start_time` (optional): Time (HH:MM or HH:MM:SS), defaults to 09:00
- `end_time` (optional): Time (HH:MM or HH:MM:SS), defaults to 17:00
- `notes` (optional): Free-text field

**Response** (201 Created):
```json
{
  "id": 1,
  "borrowernumber": 42,
  "branchcode": "MAIN",
  "shift_date": "2026-05-21",
  "start_time": "09:00:00",
  "end_time": "17:00:00",
  "notes": "Opening shift"
}
```

**Errors**:
- `400`: Missing/invalid fields
- `403`: Insufficient permissions
- `404`: Borrower or branch not found
- `500`: Database error

---

### DELETE /assignments/:id

**Remove a shift**

```bash
DELETE /api/v1/contrib/kohastaffschedule/assignments/1
```

**Response** (204 No Content): Empty body

**Errors**:
- `403`: Insufficient permissions
- `404`: Assignment not found
- `500`: Database error

---

## 🎨 Frontend Usage

The frontend is a self-contained JavaScript bundle with no build step required.

### File Structure
```
Koha/Plugin/Com/McKinneyLibrary/kohastaffschedule/
├── dashboard.tt          # Koha Template Toolkit wrapper
├── bundle.js             # Client-side app (~8KB, vanilla JS)
├── static/               # Static assets directory
└── api/
    └── routes.pl         # REST API routes
```

### bundle.js Features

**Configuration** (injected by `dashboard.tt`):
```javascript
window.KohaScheduleConfig = {
  branches: [
    { id: "MAIN", name: "Main Branch" },
    { id: "OUT", name: "Out" }
  ],
  staff: [
    { id: 42, name: "John Smith" }
  ],
  isAdmin: true,
  apiUrl: '/api/v1/contrib/kohastaffschedule/'
}
```

**UI Components**:
- Week navigation (prev/next/today buttons)
- Branch filter dropdown
- Staff-by-day grid
- Click cells to add shifts (admin only)
- Delete buttons on shift chips (admin only)

**State Management**:
- Centralized state object
- Re-renders on updates
- Automatic API calls
- Toast messages for feedback

---

## 🔧 Troubleshooting

### Plugin doesn't appear in Admin > Manage Plugins

- Ensure the `.kpz` file is correctly zipped with `Koha/` directory at the root
- Check Koha logs: `tail -f /var/log/koha/koha-error_log`

### API returns 403 Unauthorized

- Verify user has `superlibrarian` permission or custom `staffing` permission
- Check `kohastaffschedule.pm` line 65 for permission logic

### Shifts don't appear on dashboard

- Ensure date range in API call matches existing shifts
- Check browser console for API errors (F12 → Network tab)
- Verify `plugin_ks_assignments` table exists: `SHOW TABLES LIKE 'plugin_ks%'`

### Dashboard shows "No shifts this week"

- Click **"Today"** to jump to current week
- Use branch filter to ensure you're viewing the right branch
- Add test shifts via the **"+ Add Shift"** button

---

## 📝 License

This project is licensed under the **GNU General Public License v3.0**.  
See the [LICENSE](LICENSE) file for full details.

---

## 🤝 Contributing

We welcome contributions from the Koha community!

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/my-feature`)
3. Commit your changes (`git commit -am 'Add my feature'`)
4. Push to the branch (`git push origin feature/my-feature`)
5. Submit a Pull Request with a clear description

### Development Notes

- **No build step required**: Edit `bundle.js` directly and reload
- **Perl style**: Follow Koha's Modern::Perl conventions
- **Testing**: Test manually in a Koha dev environment before submitting PRs

---

## 📧 Support

For issues, questions, or feature requests:

- **GitHub Issues**: https://github.com/mckinneylibrary/kohastaffscheduler/issues
- **Koha Community**: https://koha-community.org/
- **McKinney Library**: dev@mckinneylibrary.org

---

## 👥 Authors

- **McKinney Library Development Team**
- Part of the Koha plugin ecosystem

**First Release**: May 2026  
**Last Updated**: May 2026
