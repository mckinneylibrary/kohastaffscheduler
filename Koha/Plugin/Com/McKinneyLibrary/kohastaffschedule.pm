package Koha::Plugin::Com::McKinneyLibrary::kohastaffschedule;
use Modern::Perl;
use base qw(Koha::Plugins::Base);
use C4::Context;

our $metadata = {
    name            => 'Koha Staff Schedule',
    author          => 'McKinney Library',
    description     => 'Staff scheduling plugin',
    date_authored   => '2025-05-20',
    date_updated    => '2026-05-20',
    minimum_version => '22.11',
    maximum_version => undef,
    version         => '1.0.0',
    static          => 'static',   # ← tells Koha to serve this folder
};

sub install {
    my ($self) = @_;
    my $dbh = C4::Context->dbh;
    # Native MariaDB tables within Koha
    $dbh->do("CREATE TABLE IF NOT EXISTS plugin_ks_assignments (
        id INT AUTO_INCREMENT PRIMARY KEY,
        borrowernumber INT NOT NULL,
        branchcode VARCHAR(10),
        shift_date DATE,
        start_time TIME,
        end_time TIME,
        notes TEXT
    ) ENGINE=InnoDB;");
    return 1;
}

sub tool {
    my ($self) = @_;
    my $template = $self->get_template({ file => 'dashboard.tt' });
    # Pass Koha data directly to the template
    my $dbh = C4::Context->dbh;
    $template->param(branches => $dbh->selectall_arrayref("SELECT branchcode, branchname FROM branches", {Slice=>{}}));
    print $self->{'cgi'}->header();
    print $template->output();
}
1;
