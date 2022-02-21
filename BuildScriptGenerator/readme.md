# Build Script Generator

This script will convert the build tasks in android-pr.yml to a script containing commands that can be run locally through WSL2. To generate the script, perform the following in this directory:

    npm install
    npx tsc
    node build/index.js -p <path to react-native-macos local repo> -o <output file name>

This will produce a bash script produced to the root of your react-native-macos repository. After generating the script, review the script and decide if there are any commands you would prefer not to execute. Disable these commands by removing them, or commenting them with bash comments (`#`),

To use the script, navigate to your react-native-macos repository root and execute the command. For example, if you named the output `build.sh`, you would run the following:

    cd /mnt/e/react-native-macos # or wherever you locally cloned react-native-macos
    ./build.sh
