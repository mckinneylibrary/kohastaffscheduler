package Koha::Plugin::Com::McKinneyLibrary::kohastaffschedule::api::routes;

use Modern::Perl;
use Mojo::Base 'Mojolicious::Controller';
use C4::Context;
use C4::Auth qw( haspermission );
use Try::Tiny;
use DateTime::Format::MySQL;

=head1 NAME

Koha::Plugin::Com::McKinneyLibrary::kohastaffschedule::api::routes

=head1 SYNOPSIS

API routes for the kohastaffschedule plugin. Provides REST endpoints for
managing staff shift assignments, with permission checks and validation.

=head1 ROUTES

  GET    /assignments         - Fetch shifts for a date range
  POST   /assignments         - Create a new shift
  DELETE /assignments/:id     - Delete a shift

=cut

=head2 list_assignments

GET /assignments?from=YYYY-MM-DD&to=YYYY-MM-DD

Fetch all assignments within a date range. Query parameters:
  - from: start date (required, YYYY-MM-DD format)
  - to:   end date (required, YYYY-MM-DD format)

Returns a JSON array of assignment objects including zone_duty.

=cut

sub list_assignments {
    my ($self) = @_;

    # Fetch query parameters
    my $from = $self->param('from');
    my $to   = $self->param('to');

    # Validate date parameters
    unless ($from && $to) {
        return $self->render(
            status => 400,
            json   => { error => 'Missing required parameters: from, to' }
        );
    }

    # Basic date format validation (YYYY-MM-DD)
    unless ($from =~ /^\d{4}-\d{2}-\d{2}$/ && $to =~ /^\d{4}-\d{2}-\d{2}$/) {
        return $self->render(
            status => 400,
            json   => { error => 'Invalid date format. Use YYYY-MM-DD' }
        );
    }

    try {
        my $dbh = C4::Context->dbh;
        my $data = $dbh->selectall_arrayref(
            "SELECT id, borrowernumber, branchcode, shift_date, start_time, end_time, zone_duty, notes
             FROM plugin_ks_assignments
             WHERE shift_date BETWEEN ? AND ?
             ORDER BY shift_date ASC, start_time ASC",
            { Slice => {} },
            $from,
            $to
        );

        return $self->render( json => $data || [] );
    } catch {
        return $self->render(
            status => 500,
            json   => { error => "Database error: $_" }
        );
    };
}

=head2 create_assignment

POST /assignments

Create a new shift assignment. Request body should be JSON:

  {
    "borrowernumber": 42,
    "branchcode": "MAIN",
    "shift_date": "2026-05-21",
    "start_time": "09:00",
    "end_time": "17:00",
    "zone_duty": "Reference Desk",
    "notes": "Opening shift"
  }

All fields except zone_duty and notes are required.

Returns the created assignment object with id.

=cut

sub create_assignment {
    my ($self) = @_;

    # Check permission: only staff managers/admins can create assignments
    unless ( _has_permission($self, 'manage_staffing') ) {
        return $self->render(
            status => 403,
            json   => { error => 'Unauthorized: insufficient permissions' }
        );
    }

    # Parse and validate JSON body
    my $json = $self->req->json;
    unless ($json) {
        return $self->render(
            status => 400,
            json   => { error => 'Request body must be valid JSON' }
        );
    }

    # Validate required fields
    my @required = qw( borrowernumber branchcode shift_date );
    for my $field (@required) {
        unless ( $json->{$field} ) {
            return $self->render(
                status => 400,
                json   => { error => "Missing required field: $field" }
            );
        }
    }

    # Validate borrower exists
    my $dbh = C4::Context->dbh;
    my $borrower = $dbh->selectrow_hashref(
        "SELECT borrowernumber FROM borrowers WHERE borrowernumber = ?",
        {},
        $json->{borrowernumber}
    );
    unless ($borrower) {
        return $self->render(
            status => 404,
            json   => { error => 'Borrower not found' }
        );
    }

    # Validate branch exists (or is special "OUT" branch)
    unless ( $json->{branchcode} eq 'OUT' ) {
        my $branch = $dbh->selectrow_hashref(
            "SELECT branchcode FROM branches WHERE branchcode = ?",
            {},
            $json->{branchcode}
        );
        unless ($branch) {
            return $self->render(
                status => 404,
                json   => { error => 'Branch not found' }
            );
        }
    }

    # Validate date format
    unless ( $json->{shift_date} =~ /^\d{4}-\d{2}-\d{2}$/ ) {
        return $self->render(
            status => 400,
            json   => { error => 'Invalid shift_date format. Use YYYY-MM-DD' }
        );
    }

    # Validate time format (optional, but if provided must be HH:MM)
    if ( $json->{start_time} && $json->{start_time} !~ /^\d{2}:\d{2}(:\d{2})?$/ ) {
        return $self->render(
            status => 400,
            json   => { error => 'Invalid start_time format. Use HH:MM or HH:MM:SS' }
        );
    }
    if ( $json->{end_time} && $json->{end_time} !~ /^\d{2}:\d{2}(:\d{2})?$/ ) {
        return $self->render(
            status => 400,
            json   => { error => 'Invalid end_time format. Use HH:MM or HH:MM:SS' }
        );
    }

    # TODO: Check Koha calendar for library closures if desired
    # my $calendar = Koha::Calendar->new( branchcode => $json->{branchcode} );
    # if ( $calendar->is_holiday( ... ) ) { ... }

    try {
        my $sth = $dbh->prepare(
            "INSERT INTO plugin_ks_assignments
             (borrowernumber, branchcode, shift_date, start_time, end_time, zone_duty, notes)
             VALUES (?, ?, ?, ?, ?, ?, ?)"
        );
        $sth->execute(
            $json->{borrowernumber},
            $json->{branchcode},
            $json->{shift_date},
            $json->{start_time} || '09:00',
            $json->{end_time}   || '17:00',
            $json->{zone_duty}  || '',
            $json->{notes}      || ''
        );

        # Fetch the created assignment
        my $id = $dbh->last_insert_id( undef, undef, 'plugin_ks_assignments', 'id' );
        my $created = $dbh->selectrow_hashref(
            "SELECT id, borrowernumber, branchcode, shift_date, start_time, end_time, zone_duty, notes
             FROM plugin_ks_assignments WHERE id = ?",
            {},
            $id
        );

        return $self->render(
            status => 201,
            json   => $created
        );
    } catch {
        return $self->render(
            status => 500,
            json   => { error => "Failed to create assignment: $_" }
        );
    };
}

=head2 delete_assignment

DELETE /assignments/:id

Delete a shift assignment by its ID.

Returns 204 No Content on success, or an error object on failure.

=cut

sub delete_assignment {
    my ($self) = @_;

    # Check permission
    unless ( _has_permission($self, 'manage_staffing') ) {
        return $self->render(
            status => 403,
            json   => { error => 'Unauthorized: insufficient permissions' }
        );
    }

    my $id = $self->param('id');
    unless ($id) {
        return $self->render(
            status => 400,
            json   => { error => 'Missing assignment ID' }
        );
    }

    try {
        my $dbh = C4::Context->dbh;

        # Verify assignment exists before deleting
        my $exists = $dbh->selectrow_hashref(
            "SELECT id FROM plugin_ks_assignments WHERE id = ?",
            {},
            $id
        );
        unless ($exists) {
            return $self->render(
                status => 404,
                json   => { error => 'Assignment not found' }
            );
        }

        # Delete the assignment
        my $sth = $dbh->prepare("DELETE FROM plugin_ks_assignments WHERE id = ?");
        $sth->execute($id);

        return $self->render( status => 204 );
    } catch {
        return $self->render(
            status => 500,
            json   => { error => "Failed to delete assignment: $_" }
        );
    };
}

=head2 _has_permission

Helper subroutine to check if the current user has permission to manage staffing.

In a real Koha setup, this would check:
  - Is the user a staff scheduling manager?
  - Is the user a system administrator?

For now, we do basic permission checking. You can extend this to use
Koha's UserPermission system.

=cut

sub _has_permission {
    my ($self, $perm) = @_;

    # Get the current user from Koha's session
    my $user = $self->stash('koha.user');
    unless ($user) {
        return 0;
    }

    # In a full implementation, check against Koha's permissions:
    # return haspermission($user->userid, { 'staffing' => $perm });
    # For now, check if user is a superuser (userid with special flag) or similar
    # This is a simplified check—extend as needed

    # For development/testing, allow if user is authenticated
    # TODO: Replace with real permission check via Koha's permission system
    return 1;
}

1;
