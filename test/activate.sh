# Source this into your shell environment to activate the local
# Perl environment.

DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
eval $(perl -Mlocal::lib=$DIR/local)
