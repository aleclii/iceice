# iceice
Integrated Crib Environment Including Crib Electronics for Babies

##Initialization
After downloading the git repository, want to make sure you have node:

```
# Run node installer
$ brew install node

# upgrade node and npm
$ brew upgrade node
$ npm install -g npm
```

You'll then want to install any of the dependencies it requires.

```
# Install modules
$ npm install twilio
$ npm install async
$ npm install serialport
$ npm install child_process
$ npm install nodemailer

# install forever globally, which we'll eventually use to run it
$ [sudo] npm install forever -g
```

The program can be run by:
```
# Directly running through node
$ node main.js
# Running through forever
$ forever main.js
# Running shell script that uses forever, and assumes that the git repository is in the pi's pi directory
$ sh startscript.sh
```

Make sure the Arduino is configured! The Arduino code is also included in the repository, and should be uploaded to an Arduino that should remain plugged into the Raspberry Pi.
Comments detailing how the code functions are included within the files.
