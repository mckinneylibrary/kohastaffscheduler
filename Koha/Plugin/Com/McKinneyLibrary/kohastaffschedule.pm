package Koha::Plugin::Com::McKinneyLibrary::kohastaffschedule;

use Modern::Perl;
use base qw(Koha::Plugins::Base);
use C4::Context;
use C4::Auth qw( haspermission check_api_auth );
use Try::Tiny;

our $VERSION = "2.0.0";
our $MINIMUM_VERSION = "22.11.00";

our $metadata = {
    name            => 'Koha Staff Schedule',
    author          => 'McKinney Public Library',
    description     => 'Advanced relational staff scheduling directly integrated with Koha branches and users.',
    date_authored   => '2026-05-20',
    date_updated    => '2026-05-20',
    minimum_version => $MINIMUM_VERSION,
    maximum_version => undef,
    version         => $VERSION,
    static          => 'static', 
};

sub install {
    my ($self) = @_;
    my $dbh = C4::Context->dbh;

    $dbh->do("CREATE TABLE IF NOT EXISTS plugin_ks_roles (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        is_active BOOLEAN DEFAULT 1
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;");

    $dbh->do("CREATE TABLE IF NOT EXISTS plugin_ks_teams (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        is_active BOOLEAN DEFAULT 1
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;");

    $dbh->do("CREATE TABLE IF NOT EXISTS plugin_ks_zones (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        color_code VARCHAR(10) DEFAULT '#bbf7d0',
        is_active BOOLEAN DEFAULT 1
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;");

    $dbh->do("CREATE TABLE IF NOT EXISTS plugin_ks_assignments (
        id INT AUTO_INCREMENT PRIMARY KEY,
        borrowernumber INT NOT NULL,
        branchcode VARCHAR(10) DEFAULT NULL,
        zone_id INT DEFAULT NULL,
        shift_date DATE NOT NULL,
        start_time TIME NOT NULL,
        end_time TIME NOT NULL,
        is_base_shift BOOLEAN DEFAULT 0,
        is_out BOOLEAN DEFAULT 0,
        series_id VARCHAR(36) DEFAULT NULL,
        custom_label VARCHAR(255),
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (borrowernumber) REFERENCES borrowers(borrowernumber) ON DELETE CASCADE,
        FOREIGN KEY (branchcode) REFERENCES branches(branchcode) ON DELETE SET NULL,
        FOREIGN KEY (zone_id) REFERENCES plugin_ks_zones(id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;");

    $dbh->do("CREATE TABLE IF NOT EXISTS plugin_ks_audit_logs (
        id INT AUTO_INCREMENT PRIMARY KEY,
        borrowernumber INT NOT NULL,
        action_type VARCHAR(50) NOT NULL,
        details TEXT NOT NULL,
        changed_by_borrowernumber INT DEFAULT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (borrowernumber) REFERENCES borrowers(borrowernumber) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;");

    $dbh->do("INSERT IGNORE INTO permissions (module_bit, code, description) 
              VALUES ((SELECT bit FROM userflags WHERE flag='plugins'), 'manage_schedule', 'Manage Koha Staff Schedule App')");

    return 1;
}

sub uninstall {
    my ($self) = @_;
    my $dbh = C4::Context->dbh;
    $dbh->do("DROP TABLE IF EXISTS plugin_ks_audit_logs");
    $dbh->do("DROP TABLE IF EXISTS plugin_ks_assignments");
    $dbh->do("DROP TABLE IF EXISTS plugin_ks_zones");
    $dbh->do("DROP TABLE IF EXISTS plugin_ks_teams");
    $dbh->do("DROP TABLE IF EXISTS plugin_ks_roles");
    $dbh->do("DELETE FROM permissions WHERE code = 'manage_schedule'");
    return 1;
}

sub tool {
    my ($self) = @_;
    my $cgi = $self->{'cgi'};
    my $dbh = C4::Context->dbh;
    my $userid = $cgi->remote_user();

    my $is_admin = 0;
    if ($userid) {
        $is_admin = haspermission($userid, { plugins => 'manage_schedule' }) ? 1 : 0;
    }

    my $template = $self->get_template({ file => 'dashboard.tt' });

    my $branches = $dbh->selectall_arrayref("SELECT branchcode, branchname FROM branches", { Slice => {} });
    my $staff = $dbh->selectall_arrayref("
        SELECT b.borrowernumber, b.firstname, b.surname, b.email 
        FROM borrowers b
        JOIN categories c ON b.categorycode = c.categorycode
        WHERE c.description = 'Library Staff' OR b.categorycode = 'STAFF'
        ORDER BY b.surname, b.firstname
    ", { Slice => {} });

    $template->param(
        branches => $branches,
        staff    => $staff,
        is_admin => $is_admin,
        userid   => $userid
    );

    print $cgi->header(-type => 'text/html', -charset => 'UTF-8');
    print $template->output();
}

sub api_routes {
    my ($self, $args) = @_;
    my $routes = $args->{routes};
    
    $routes->get('/data')->to('plugin-kohastaffschedule-api-routes#get_all_data');
    $routes->post('/assignments')->to('plugin-kohastaffschedule-api-routes#create_assignment');
    $routes->put('/assignments/:id')->to('plugin-kohastaffschedule-api-routes#update_assignment');
    $routes->delete('/assignments/:id')->to('plugin-kohastaffschedule-api-routes#delete_assignment');
    
    return $routes;
}

1;
