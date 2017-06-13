#!/usr/bin/env perl
# Runs tests against the RenderMath server.  Make sure the server is up and running
# at the appropriate URL (default is http://localhost:16000, but you can specify another
# on the command line.)
# Run `test.pl -?` for usage information.

use strict;
use warnings;

use FindBin;
use local::lib "$FindBin::RealBin/local";
use Carp::Assert;
use open ':encoding(utf8)';
binmode STDOUT, ':utf8';

use Test::More;
use YAML;
use LWP::UserAgent;
use URI::Encode qw(uri_encode);
#use HTTP::Request::Common qw{ POST };
use Getopt::Long;
use Data::Dumper;
use List::Util qw(any);

my $debug = 1;

my $examples_dir = '../static/examples';
my $default_service_url = 'http://localhost:16000';

my %options;
my $opts_ok = GetOptions(\%options,
    'help|?',
    'verbose',
    'writesvg',
    'url=s',
    #'halt',
);
if (!$opts_ok || $options{help}) {

    print <<USAGE;
Usage:  test.pl [options] [<tests>]
Runs tests against the RenderMath server.  Make sure the server is up and running
at the appropriate URL.
If no <tests> arguments are given, then all the tests are run. Tests can be
specified by number (e.g. `44`), exact name (`bad-latex`), or regular expression
(`/good/`).

Options

--help|-? - print this usage information and exit
--verbose - output verbose messages
--writesvg - write the svg results from each test case to a file
--url=[url] - the URL of the service; defaults to $default_service_url.
USAGE
# FIXME: implement this:
#--halt - halt on error; default is to run all tests regardless.


    exit !$opts_ok;
}
my $verbose = $options{verbose} || 0;
my $writesvg = $options{writesvg} || 0;
my $url = $options{url} || $default_service_url;
my $halt_on_error = $options{halt} || 0;

my $ua = LWP::UserAgent->new();
print "Testing service at $url\n";


# Read in the list of example files
my $examples = Load(do {
    local $/ = undef;
    my $fn = "$examples_dir/examples.yaml";
    open my $F, "<", $fn or die "Can't read $fn";
    <$F>;
});
my %examples_by_name = map { $_->{name} => $_ } @$examples;
#print Dumper(\%examples_by_name);

# Read in the list of tests
my @tests = @{ Load(do {
    local $/ = undef;
    my $fn = "tests.yaml";
    open my $F, "<", $fn or die "Can't read $fn";
    <$F>;
}) };
my $num_tests = scalar @tests;

# Add test number to each test object
foreach my $test_num (0 .. $#tests) {
    my $test = $tests[$test_num];
    $test->{'num'} = $test_num;
}
print("Total number of tests defined: $num_tests\n");
#print Dumper(\@tests) if $debug;

# Convert a string to a non-negative integer if it doesn't have extraneous
# characters, otherwise returns 'NaN'.
sub to_int {
    my $arg = shift;
    no warnings 'numeric';
    my $argInt = int($arg);
    return "$argInt" eq "$arg" ? $argInt : 'NaN';
}

if ($debug) {
    assert(to_int('3455') == 3455);
    assert(to_int('0') == 0);
    assert(to_int('6u') eq 'NaN');
}

# Returns a predicate function that returns true if a test matches the
# criteria implicit in one command-line argument. There are three cases:
# A. $arg is an integer - explicit test number
# B. $arg is a string bracketed by slashes (e.g. `/foo/`) - regexp
# C. $arg is any other string - match any part of the test name
sub match_term {
    my $arg = shift;

    # integer
    my $argInt = to_int($arg);
    if ($argInt ne 'NaN') {
        #print("================== match int\n");
        return sub {
            my $test = shift;
            return $test->{num} == $argInt;
        }
    }

    # If it is bracketed by slashes, then strip those off and use it
    # as a regexp
    if ($arg =~ s/^\/(.*)\/$/$1/) {
        #print("================== match regexp\n");
        return sub {
            my $test = shift;
            return $test->{name} =~ $arg;
        };
    }

    # otherwise, do an substring match
    #print("================== match substr\n");
    return sub {
        my $test = shift;
        return index($test->{name}, $arg) != -1;
    };
}

if ($debug) {
    my $mt = match_term('2');
    assert(&$mt( { num => 2 } ));
    assert(! &$mt( { num => 3 } ));
    $mt = match_term('/foo.*/');
    assert(&$mt( { name => 'garafoobert' } ));
    assert(! &$mt( { name => 'garafobart' } ));
    $mt = match_term('fleegle');
    assert(&$mt( { name => 'split fleegle boot' } ));
    assert(! &$mt( { name => 'garfleglemons' } ));
}

# The master matcher - a function that, when given a test, determines if it
# matches any of the criteria
sub matcher {
    my $args = shift;
    if (scalar @$args == 0) {   # no args given; match all
        return sub { return 1; };
    }

    my @matchers = map { match_term($_) } @$args;
    return sub {
        my $test = shift;
        #print("  .... checking test $test->{num}\n");
        return any { &$_($test) } @matchers;
    };
}

my $test_matcher = matcher(\@ARGV);
foreach my $test (@tests) {
    #print("  .. checking test $test->{num}\n");
    if (&$test_matcher($test)) {
        test_one($test);
    }
}

done_testing();


# Run one test
sub test_one {
    my $test = shift;
    my $test_num = $test->{num};
    my $test_name = $test->{name};
    print("\n======== Test #$test_num: '$test_name'\n");
    my $request = $test->{request} || {};
    my $expected = $test->{expected};

    if ($request->{example}) {
        my $example = $examples_by_name{$request->{example}};
        my $filename = $examples_dir . '/' . $example->{filename};
        $request->{q} = do {  # slurp the file
            local $/ = undef;
            open my $f, "<", $filename or die "Can't open $filename for reading";
            <$f>;
        };
        delete $request->{example};
    }
    my $request_method = 'POST';
    if ($request->{method}) {
        $request_method = $request->{method};
        delete $request->{method};
    }
    my $path = '/';
    if ($request->{path}) {
        $path = $request->{path};
        delete $request->{path};
    }
    my $test_url = $url . $path;

    print "\$request: " . Dumper($request) if $verbose;

    # Execute the request; either GET or POST
    my $response;
    if ($request_method eq 'GET') {
        # Construct the GET URL from the request parameters
        my $get_url = $test_url . ((keys $request == 0) ? '' :
            '?' . join('&', map {
                $_ . '=' .uri_encode($request->{$_})
            } keys $request));
        print "Testing $test_name: $request_method: $get_url\n" if $verbose;
        $response = $ua->get($get_url);
    }
    else {
        if ($verbose) {
            print "Testing $test_name: ". $request_method . ":\n";
            print "  '" . join("\n  ", map {
                    "$_=" . ($_ eq 'q' ? string_start($request->{$_}) : $request->{$_})
                } keys %$request) . "'\n";
        }
        $response = $ua->post($test_url, $request);
    }

    my $expected_code = $expected->{code} || 200;
    is ($response->code(), $expected_code,
        "Test $test_name: got expected response code $expected_code");

    #ok (!$response->is_error(), "Good response for $filename") or
    #    diag("  Response status line was '" . $response->status_line . "'");

    my $content  = $response->decoded_content();
    if ($verbose) {
        print "  returned '" . string_start($content) . "'\n";
    }

    if ($expected->{'content-contains'}) {
        ok (index($content, $expected->{'content-contains'}) != -1,
            "Test $test_name: response contains expected string");
    }

    my $expected_content_type = $expected->{'content-type'} || 'image/svg+xml; charset=utf-8';
    is ($response->header('content-type'), $expected_content_type,
        "Test $test_name: expected content-type: " . $expected_content_type);

    if ($expected->{format} && $expected->{format} eq 'svg') {
        like ($content, qr/^<svg/, "Test $test_name: response looks like SVG");
    }

    if ($writesvg) {
        my $svg_filename = "$test_name.svg";
        open my $svg_file, ">", $svg_filename or die "Can't open $svg_filename for writing";
        print $svg_file $content;
        close $svg_file;
    }
}



# This is for printing out a long string.  If it is > 100 characters, it is
# truncated, and an ellipsis ("...") is added.
sub string_start {
    my $s = shift;
    chomp $s;
    my $ss = substr($s, 0, 100);
    $ss =~ s/\n/\\n/gs;
    return $ss . (length($s) > 100 ? "..." : "");
}
