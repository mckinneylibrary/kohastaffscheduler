# Inside routes.pl - using Perl DBI
sub get_schedule {
    my ($self, $c) = @_;
    my $dbh  = C4::Context->dbh;
    my $from = $c->param('from');
    my $to   = $c->param('to');
    my $data = $dbh->selectall_arrayref(
        "SELECT * FROM plugin_ks_assignments WHERE shift_date BETWEEN ? AND ?",
        {Slice=>{}}, $from, $to
    );
    return $c->render(json => $data);
}
