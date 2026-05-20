package Koha::Plugin::Com::McKinneyLibrary::kohastaffschedule;

use Modern::Perl;
use base qw(Koha::Plugins::Base);
use C4::Context;
use C4::Auth qw( haspermission );
use C4::Members;
use Try::Tiny;

=head1 NAME

Koha::Plugin::Com::McKinneyLibrary::kohastaffschedule

=head1 DESCRIPTION

Staff scheduling plugin for Koha ILS. Manages shift assignments natively
within Koha's MariaDB database, integrating with borrower records and branches.

=head1 VERSION

1.0.0

=cut

our $metadata = {
    name            => 'Koha Staff Schedule',
    author          => 'McKinney Library',
    description     => 'Staff scheduling plugin for managing shift assignments',
    date_authored   => '2025-05-20',
    date_updated    => '2026-05-20',
    minimum_version => '22.11',
    maximum_version => undef,
    version         => '1.0.0',
    static          => 'static',   # tells Koha to serve static assets
};

=head2 install

Called when the plugin is first installed. Creates the plugin's database table.

=cut

sub install {
    my ($self) = @_;
    my $dbh = C4::Context->dbh;

    # Create the main assignments table if it doesn't exist
    $dbh->do("CREATE TABLE IF NOT EXISTS plugin_ks_assignments (
        id INT AUTO_INCREMENT PRIMARY KEY,
        borrowernumber INT NOT NULL,
        branchcode VARCHAR(10) NOT NULL,
        shift_date DATE NOT NULL,
        start_time TIME,
        end_time TIME,
        zone_duty VARCHAR(100),
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (borrowernumber) REFERENCES borrowers(borrowernumber) ON DELETE CASCADE,
        FOREIGN KEY (branchcode) REFERENCES branches(branchcode) ON DELETE CASCADE,
        INDEX idx_date (shift_date),
        INDEX idx_borrower (borrowernumber),
        INDEX idx_branch (branchcode)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;") or return 0;

    return 1;
}

=head2 uninstall

Called when the plugin is uninstalled. Drops the plugin's database table.

=cut

sub uninstall {
    my ($self) = @_;
    my $dbh = C4::Context->dbh;
    $dbh->do("DROP TABLE IF EXISTS plugin_ks_assignments") or return 0;
    return 1;
}

=head2 tool

Main dashboard interface. Renders the staff scheduling dashboard.
Passes branch and staff data to the frontend bundle.js via the template.

=cut

sub tool {
    my ($self) = @_;
    my $dbh = C4::Context->dbh;

    # Get current user from CGI environment (set by Koha during authentication)
    my $userid = $self->{'cgi'}->remote_user();
    
    # Check if user has admin/staffing permissions
    my $is_admin = 0;
    if ($userid) {
        # In a full setup, you'd check against Koha's permission table:
        # my $perm = haspermission($userid, { 'staffing' => 'manage_staffing' });
        # For now, check if user has superlibrarian permission as proxy
        my $user_perms = haspermission($userid, { 'superlibrarian' => 1 });
        $is_admin = $user_perms ? 1 : 0;
    }

    my $template = $self->get_template({ file => 'dashboard.tt' });

    # Fetch branches (excluding the virtual "OUT" branch; handled client-side)
    my $branches = $dbh->selectall_arrayref(
        "SELECT branchcode, branchname FROM branches ORDER BY branchname",
        { Slice => {} }
    ) || [];

    # Fetch staff members (borrowers with a specific flag or role)
    # For now, fetch all active borrowers; refine this based on your Koha setup
    my $staff = $dbh->selectall_arrayref(
        "SELECT borrowernumber, firstname, surname, branchcode
         FROM borrowers
         WHERE debarred IS NULL
         ORDER BY surname, firstname",
        { Slice => {} }
    ) || [];

    # Pass data to template
    $template->param(
        branches => $branches,
        staff    => $staff,
        is_admin => $is_admin,
    );

    print $self->{'cgi'}->header();
    print $template->output();
}

=head2 api_routes

Register REST API routes for the plugin. Called by Koha's plugin routing system.

Routes registered:
  GET    /assignments?from=YYYY-MM-DD&to=YYYY-MM-DD
  POST   /assignments
  DELETE /assignments/:id

=cut

sub api_routes {
    my ($self, $args) = @_;
    my $routes = $args->{routes};

    # Each route is namespaced to this plugin
    # Koha automatically prefixes with /api/v1/contrib/kohastaffschedule/

    $routes->get('/assignments')->to(
        'plugin-kohastaffschedule-api-routes#list_assignments'
    );

    $routes->post('/assignments')->to(
        'plugin-kohastaffschedule-api-routes#create_assignment'
    );

    $routes->delete('/assignments/:id')->to(
        'plugin-kohastaffschedule-api-routes#delete_assignment'
    );

    return $routes;
}

=head2 configure

(Optional) Called when user clicks "Configure" on the plugin page.
Can be used to set plugin-specific configuration options.

=cut

sub configure {
    my ($self, $args) = @_;
    # Placeholder for future configuration interface
    return 1;
}

1;

__END__

=head1 AUTHOR

McKinney Library <dev@mckinneylibrary.org>

=head1 LICENSE

This plugin is distributed under the terms of the GNU General Public License v3.0.
See the LICENSE file included in the plugin distribution for details.

=head1 SUPPORT

For issues, questions, or contributions, visit:
https://github.com/mckinneylibrary/kohastaffscheduler
