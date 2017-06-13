#!/bin/bash
# Set up local Perl environment. You should only need to do this once.
# Then, for each new bash shell, activate this local Perl environment with:
#     . ./activate.sh

DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

# Activate the local environment; the first time this is run, Perl creates
# the `local` directory.
. "$DIR/activate.sh"

# Verify a selected environment variable is set
: "${PERL_LOCAL_LIB_ROOT:?This environment variable should be set. "\
"There seems to be a fundamental problem with your Perl installation; sorry!}"

if [ ! -d "$DIR/local" ]; then
  echo "Failed to make/activate a local Perl environment; giving up."
  exit 1
fi

# Check for Carton
perl -MCarton -e 1 > /dev/null 2>&1
if [ $? -ne 0 ]; then
  echo "Installing Carton in your local Perl environment"
  cpanm install Carton
fi

echo "Installing other Perl dependencies in your local Perl environment"
carton install
