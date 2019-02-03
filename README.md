# Sunrise Controller App

This app is for controlling, scheduling and restarting the Sunrise Kingdom application.

## Requirements

- [node.js](https://nodejs.org/en/)
- [pm2](http://pm2.keymetrics.io/) 

        # to install pm2 globally you must do the following: 
        npm install pm2 -g
        
- To enable nodemailer to send emails from an email address follow the instructions [here](https://stackoverflow.com/questions/14654736/nodemailer-econnrefused)


## Project Setup + Adding Packages

To install new packages to this repository follow the examples below:

    cd [repository-directory]
    npm init                         # only once to create package.json 
    npm install node-schedule
    npm install mkdirp
    npm install nodemailer
    npm install pm2
    
        
## Development setup

- Follow these steps when you want to start development of the _Sunrise Kingdom Controller_
- Clone this repository
- Open a terminal and go into the cloned directory, then:

        npm install 
        

## Usage

For production you should start the controller using:

    node sunriseController.js

And with pm2 you start it like this:

    pm2 start sunriseController.js
    
During development you can trigger a recording like this:

    node sunriseController.js --schedule-recording-in-sec 5 \
                              --recording-settings-file ".\data\settings\settingsRecorderWowza.xml" \
                              --record-for-seconds 10
                               

For different installations you can use specific configuration variables set via an environment variable called NODE_ENV. To set this follow these steps:

1. Go to Control Panel > System > Advanced System Settings.
2. Open Environment Variables... at the bottom.
3. Under System Variables click New.
4. set Variable Name to NODE_ENV and set Variable Value to the name of your config file in the config folder.
5. if unset it will revert to default settings as described in config/default.json.

To Launch the application on startup follow these instructions for windows 10 found [here](https://www.computerhope.com/issues/ch000322.htm).

1. Create a shortcut to startController.bat by right clicking on it.
2. Then right-click the file and select **Cut**.
3. Press the Start button and type **Run** and press enter.
4. In the Run window, type **shell:startup** to open the Startup folder
5. Pase the shortcut in to the Startup folder.

## TODO

- The `restartAllPlayers()` is supposed to restart one or all players (I'm not sure why it was called *all*)
- The `restartAllPlayers()` will not start a new one which means that now player will be started.

## File Structure

This is based on the following file structure:

Project

    |-- SunriseController.js  
    |-- Playback.exe  
    |-- Recorder.exe  
    |-- data  
    |   |-- recordings 
    |   |   |-- curentRecordings.h264  
    |   |   |-- currentRecordings.meta  
    |   |   |-- player-settings.xml  
    |   |-- settings  
    |   |   |-- recorder-settings.xml  
    |   |-- storage  
    |   |   |-- date  
    |   |   |   |-- archivedRecordings.h264  
    |   |   |   |-- archivedRecordings.meta  
    |   |   |   |-- archivedplayer-settings.xml  
    |   |-- sunriseTables  
    |   |   |-- 2018.txt  
    |   |   |-- 2019.txt  

## Convert .h264 videos to mp4

`ffmpeg -framerate 24 -i input.264 -c copy output.mp4`