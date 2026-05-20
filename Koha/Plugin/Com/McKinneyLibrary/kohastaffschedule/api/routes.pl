# Inside routes.pl - using Perl DBI
sub get_schedule {
    my $dbh = C4::Context->dbh;
    my $data = $dbh->selectall_arrayref("SELECT * FROM plugin_ks_assignments", {Slice=>{}});
    return $c->render(json => $data);
}
