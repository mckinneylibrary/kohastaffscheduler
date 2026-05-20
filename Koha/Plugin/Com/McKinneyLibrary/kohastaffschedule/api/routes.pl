package Koha::Plugin::Com::McKinneyLibrary::kohastaffschedule::api::routes;

use Modern::Perl;
use Mojo::Base 'Mojolicious::Controller';
use C4::Context;

sub get_all_data {
    my ($self) = @_;
    my $dbh = C4::Context->dbh;

    my $date = $self->param('date');
    my $assignments = $dbh->selectall_arrayref("SELECT * FROM plugin_ks_assignments", { Slice => {} });
    my $zones = $dbh->selectall_arrayref("SELECT * FROM plugin_ks_zones WHERE is_active = 1", { Slice => {} });
    my $roles = $dbh->selectall_arrayref("SELECT * FROM plugin_ks_roles WHERE is_active = 1", { Slice => {} });
    my $teams = $dbh->selectall_arrayref("SELECT * FROM plugin_ks_teams WHERE is_active = 1", { Slice => {} });
    my $logs = $dbh->selectall_arrayref("
        SELECT l.*, b.firstname, b.surname 
        FROM plugin_ks_audit_logs l 
        LEFT JOIN borrowers b ON l.changed_by_borrowernumber = b.borrowernumber
        ORDER BY created_at DESC LIMIT 100
    ", { Slice => {} });

    return $self->render( status => 200, json => {
        assignments => $assignments,
        zones => $zones,
        roles => $roles,
        teams => $teams,
        audit_logs => $logs
    });
}

sub create_assignment {
    my ($self) = @_;
    my $body = $self->req->json;
    my $dbh = C4::Context->dbh;

    my $is_out = 0;
    my $branchcode = $body->{branchcode};
    if ($branchcode && uc($branchcode) eq 'OUT') {
        $is_out = 1;
        $branchcode = undef;
    }

    $dbh->do("
        INSERT INTO plugin_ks_assignments 
        (borrowernumber, branchcode, zone_id, shift_date, start_time, end_time, is_base_shift, is_out, series_id, custom_label, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ", undef, 
        $body->{borrowernumber}, $branchcode, $body->{zone_id}, $body->{shift_date}, 
        $body->{start_time}, $body->{end_time}, $body->{is_base_shift}, $is_out, 
        $body->{series_id}, $body->{custom_label}, $body->{notes}
    );

    # Create Audit Log
    my $action = $body->{is_base_shift} ? 'BRANCH_SHIFT_CREATE' : 'ZONE_SHIFT_CREATE';
    $dbh->do("INSERT INTO plugin_ks_audit_logs (borrowernumber, action_type, details, changed_by_borrowernumber) VALUES (?, ?, ?, ?)", 
        undef, $body->{borrowernumber}, $action, "Added shift on $body->{shift_date}", $body->{current_user_id});

    return $self->render( status => 201, json => { message => "Created" } );
}

sub update_assignment {
    my ($self) = @_;
    my $id = $self->param('id');
    my $body = $self->req->json;
    my $dbh = C4::Context->dbh;

    my $is_out = 0;
    my $branchcode = $body->{branchcode};
    if ($branchcode && uc($branchcode) eq 'OUT') {
        $is_out = 1;
        $branchcode = undef;
        # Auto-delete overlapping zones if branch changed to OUT
        $dbh->do("DELETE FROM plugin_ks_assignments WHERE borrowernumber = ? AND shift_date = ? AND is_base_shift = 0 AND start_time < ? AND end_time > ?", 
            undef, $body->{borrowernumber}, $body->{shift_date}, $body->{end_time}, $body->{start_time});
    }

    $dbh->do("
        UPDATE plugin_ks_assignments SET 
        branchcode = ?, zone_id = ?, start_time = ?, end_time = ?, is_out = ?, custom_label = ?, notes = ?
        WHERE id = ?
    ", undef, 
        $branchcode, $body->{zone_id}, $body->{start_time}, $body->{end_time}, 
        $is_out, $body->{custom_label}, $body->{notes}, $id
    );

    $dbh->do("INSERT INTO plugin_ks_audit_logs (borrowernumber, action_type, details, changed_by_borrowernumber) VALUES (?, ?, ?, ?)", 
        undef, $body->{borrowernumber}, 'SHIFT_UPDATE', "Updated shift times to $body->{start_time}-$body->{end_time}", $body->{current_user_id});

    return $self->render( status => 200, json => { message => "Updated" } );
}

sub delete_assignment {
    my ($self) = @_;
    my $id = $self->param('id');
    my $dbh = C4::Context->dbh;
    
    my $assignment = $dbh->selectrow_hashref("SELECT borrowernumber FROM plugin_ks_assignments WHERE id = ?", undef, $id);
    if ($assignment) {
        $dbh->do("DELETE FROM plugin_ks_assignments WHERE id = ?", undef, $id);
        $dbh->do("INSERT INTO plugin_ks_audit_logs (borrowernumber, action_type, details) VALUES (?, ?, ?)", 
            undef, $assignment->{borrowernumber}, 'SHIFT_DELETED', "Shift ID $id deleted");
    }

    return $self->render( status => 204, json => {} );
}

1;
