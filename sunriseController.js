var pm2 = require('pm2')					// For managing processes including viewer and recorder.
var schedule = require('node-schedule')		// For scheduling events to happen in the future.
var fs = require('fs-extra')				// For managing my file system.
var mkdirp = require('mkdirp')				// For making directories
var minimist = require('minimist')			// For parsing command-line arguments passed to the controller.
// var http = require('http')
var express = require('express')			// For rendering our control gui.
var path = require('path')					// For nicely creating paths to files.
var bodyParser = require('body-parser')		// For parsing user input
var sharp = require('sharp')				// For Screenshotting
var config = require('config')				// For storing configuration files which we'll use as settings.

/* --------------------------------------------------------------------------- */

var app = express()							// Setup out application with our control gui renderer.

var checkSunriseRule = new schedule.RecurrenceRule()
checkSunriseRule.hour = 1
checkSunriseRule.minute = 0

// These are variables loaded by config. by default these are set in the file config/default.json.
// To add another file just run: export NODE_ENV=westport for example before running node sunriseController.js 
// and it will take whatever parameters it can from a config file in the same folder called westport.json ie config/westport.json
var recorderSettings = config.get('Settings.Recorder')
var playerSettings = config.get('Settings.Player')
var timezoneSettings = config.get('Settings.Timezone')

var recordingsPath = recorderSettings.recordingsPath
var storagePath = recorderSettings.storagePath
var screenshotPath = recorderSettings.screenshotPath
var recordingCameraIP = recorderSettings.cameraIP
var recordingDuration = recorderSettings.duration
var recordingOffset = recorderSettings.offset
var playerWidth = playerSettings.windowWidth
var playerHeight = playerSettings.windowHeight
var playerX = playerSettings.windowX
var playerY = playerSettings.windowY
var videoWidth = playerSettings.videoWidth
var videoHeight = playerSettings.videoHeight
var videoX = playerSettings.videoX
var videoY = playerSettings.videoY

var timezoneOffset = timezoneSettings.offset

/* --------------------------------------------------------------------------- */

/*
  This is our application entry point and kicks of all logic.  Connect to the
  running pm2 server, if there's an error here exit.
*/
pm2.connect(function(err) {
	if(err) {
		console.log(err)
		process.exit(2)
	}

	// Immediately try to play our most recent recording. Either using command line arguments or using the lookup table.
	playMostRecentRecording(recordingsPath, function() {
		var opts = minimist(process.argv.slice(2))
	 	if (undefined != opts['schedule-recording-in-sec']) {
	 		// command line argument found, so use those.
	 		console.log(opts['schedule-recording-in-sec'])
	  		scheduleRecordingUsingCommandLineArguments(opts)
	  	} else {
	  		// no command line arguments found so run in show-mode and lookup new sunrises automatically.
	  		scheduleRecordingUsingSunriseTables()
	  	}
	})

	// Setup our view engine so we can render our GUI
	app.set('view engine', 'ejs')

	// allow for url encoded message body parsing so we can recieve input from the user.
	urlBodyParser = bodyParser.urlencoded({
		extended: true
	})

	// Start the app listeneing on a port. We chose for 1433 because we're cool like that.
	app.listen(1433, function() {
		console.log('Listening on port 1433!')
	})

	// Use the controlGui .html file found in the data/controlGui folder.
	app.use(express.static(__dirname + '\\data\\controlGui\\'))

	// Render the controlGui .html file when the user visits the expected port.
	app.get('/', function(req, res) {
		console.log("Sorting recording dates")
		sortRecordingDates(recordingsPath, function(dates) {
			var dateLabels = []
			if(dates != null) {
				dates.forEach(function(date) {
					dateLabels.push(getFolderLabelFromDate(date))
				})
			} else {
				console.log("No recordings found in " + recordingsPath + ", rendering page anyway with an empty list of dates.")
			}
			res.render(path.join(__dirname+'/data/controlGui/index.ejs'), {dateLabels: dateLabels})
		})
	})

	// Handle the user manually toggling the screensaver.
	app.post('/activateScreensaver', function(req, res) {
		var now = new Date()
		now.setTime(now.getTime() + 1000 * 1)
		schedulePlayer(now, function() {
			playScreensaverRecording(function() {
				console.log("Playing Screensaver Recording")
			})
		})
	})

	// Handle the user manually toggling the most recent recording.
	app.post('/activateLastRecording', function(req, res) {
		var now = new Date()
		now.setTime(now.getTime() + 1000 * 1)
		schedulePlayer(now, function() {
			playMostRecentRecording(recordingsPath, function() {
				console.log("Playing Most Recent Recording")
			})
		})
	})

	// Handle the user manually toggling a particular recording.
	app.post('/activateSelectedRecording', urlBodyParser, function(req, res) {
		var now = new Date()
		now.setTime(now.getTime() + 1000 * 1);
		schedulePlayer(now, function() {
			if(req.body.date_select) {
				playSpecificRecording(req.body.date_select, function() {
					console.log("Playing Selected recording from: " + req.body.date_select)
				})
			} else {
				console.log("Specified Recording Unavailable")
				playScreensaverRecording( function () {
					console.log("Playing Screensaver Recording Instead")
				})
			}
		})
	})
})
/* --------------------------------------------------------------------------- */

/* 

   Check if the user specified command line arguments. If so, check how we should
   start.  You can schedule a manual recording from the command line doing
   something like:

   $ node sunriseController.js --schedule-recording-in-sec 5
   --recording-camera-ip 192.168.1.51
   --record-for-seconds 60
*/
function scheduleRecordingUsingCommandLineArguments(opts) {

	if (false == validateCommandLineOptionsForManualRecording(opts)) {
		return false
	}

	var startRecordDate = new Date()
	startRecordDate.setSeconds(startRecordDate.getSeconds() + parseInt(opts['schedule-recording-in-sec']))
	console.log(`Scheduling recording at: ${startRecordDate}`)
	scheduleRecording(startRecordDate, recordingsPath, opts['recording-camera-ip'], opts['record-for-seconds'])

	var startPlayingDate = new Date()
	startPlayingDate.setSeconds(startPlayingDate.getSeconds() + parseInt(opts['schedule-recording-in-sec']) + parseInt(opts['record-for-seconds']) + 10)
	console.log(`Scheduling playback at: ${startPlayingDate}`)
	schedulePlayer(startPlayingDate, function() {
		playMostRecentRecording(recordingsPath, function() {
  			scheduleRecordingUsingCommandLineArguments(opts)
  		})
  	})
}

/* Using the sunrise table files to schedule a new recording. */
function scheduleRecordingUsingSunriseTables() {
	var year = new Date().getFullYear()
	parseDateFile("data/sunriseTables/"+year+".txt", function(data) {
		var today = new Date()
		prepNextSunrise(today, data)
	})
}

/*
  Schedule a recording to happen at an individual date.

  - date:         	When we should start the recording
  - dataPath:     	Where to store the recordings
  - cameraIP: 		The Camera IP address we pass to the parser.exe file.
  - duration:     	Duration of the recording in seconds. 
*/
function scheduleRecording(date, dataPath, cameraIP, duration) {
	var startRecorderJob = schedule.scheduleJob(date, function() {
		startRecorder(dataPath, cameraIP, duration, function() {
			console.log("Scheduled new recording from camera: " + cameraIP + " at: " + date + " for duration: " + duration)
		})
	})
	return startRecorderJob;
}

/* Schedule a playback to happen at an individual date. */
function schedulePlayer(date, callback) {
	var startPlayerJob = schedule.scheduleJob(date, function() {
		deletePlayer(function() {
			callback()
		})
	})

	var timeToStoreVideos = new Date();
	timeToStoreVideos.setTime(timeToStoreVideos.getTime() - 1000 * 60 * 60 * 24 * 5);
	console.log("Deleting oldest videos in " + recordingsPath)
	deleteOldestRecordingsInPlace(recordingsPath, 2)
	var timeToDeleteVideos = new Date()
	timeToDeleteVideos.setTime(timeToDeleteVideos.getTime() - 1000 * 60 * 60 * 24 * 30)
	// deleteOldFilesInStorage(storagePath, timeToDeleteVideos, function(date) {
	// 	if(date)
	// 		console.log("Deleted recording from date: " + date)
	// })
	console.log(`Start Player Job: ${date}`)
	return startPlayerJob
};

/* --------------------------------------------------------------------------- */

function printUsage() {
  var app = process.argv[1];
  console.log("");
  console.log("");
  console.log("Usage: ");
  console.log("--schedule-recording-in-sec:      Manually start a recording in X-seconds. (Specify --recording-camera-ip, --record-for-seconds)");
  console.log("--recording-camera-ip:        	 IP address of the camera from which we want to record.");
  console.log("--record-for-seconds:             The number of seconds you want to record.");
  console.log("");
  console.log("");
}

/* 
   Valdate if all the required command line arguments were given for a manual
   scheduled (via command line) recording.
*/
function validateCommandLineOptionsForManualRecording(opts) {

  if (undefined == opts['recording-camera-ip']) {
	console.log(opts);
    console.error("No --recording-camera-ip given, cannot schedule a recording.");
    return false;
  }

  if (undefined == opts['record-for-seconds']) {
    console.error("No --record-for-seconds given, cannot schedule a recording.");
    return false;
  }

  if (undefined == opts['schedule-recording-in-sec']) {
    console.error("No --schedule-recording-in-sec given, cannot schedule a recording.");
    return false;
  }
  
  return true;
}

// Parse the date file and save it as a variable.
function parseDateFile(file, callback) {
	fs.readFile(file, 'utf8', function(err, data) {
		if(err) {
			throw err
		}
		callback(data)
	})
}

// Given a particular moment, gets the time and date of the next sunrise as a Date object.
function prepNextSunrise(date, data) {

	var startingPoint = 1224
	var numCharactersPerRow = 136
	var startRowOffset = 4
	var sunriseOffset = 11

	var day = date.getDate()
	var month = date.getMonth()

	var datePoint = startingPoint + startRowOffset + numCharactersPerRow*(day-1) + sunriseOffset*(month)

	var sunriseHourToday = data[datePoint] + data[datePoint+1]
	var sunriseMinuteToday = data[datePoint+2] + data[datePoint+3]

	// TODO: This will crash if it goes in to the next year.
	// TODO: Account for Daylight Savings Time? Or just ignore it?
	var sunriseDate = new Date(date)
	sunriseDate.setHours(sunriseHourToday)
	sunriseDate.setMinutes(sunriseMinuteToday)

	console.log("Sunrise Date: " + sunriseDate)

	if(date > sunriseDate) {
		// Get Next Sunrise. To do this add 1 day to the date and then set it's hour to 1am. Then find the sunrise again.
		console.log("Sunrise has already passed, Checking for the sunrise tomorrow")
		sunriseDate.setTime(sunriseDate.getTime() + 24*60*60*1000)
		sunriseDate.setHours(0)
		sunriseDate.setMinutes(0)
		sunriseDate.setSeconds(0)
		prepNextSunrise(sunriseDate, data)
	} else {
		// Sunrise today has not yet started so we can schedule our sunrise recordings.
		console.log("Recording Offset: " + 1000 * recordingOffset)
		sunriseDate.setTime(sunriseDate.getTime() - 1000 * recordingOffset)
		console.log("Sunrise has not yet passed So the sunrise time minus " + recordingOffset + " seconds is: " + sunriseDate + "Scheduling a recording at that date and time")
		scheduleRecording(sunriseDate, recordingsPath, recordingCameraIP, recordingDuration)
		var recordingFinishedDate = new Date(sunriseDate)
		recordingFinishedDate.setTime(recordingFinishedDate.getTime() + 1000 * 60 * 60 + 1000 * 60)
		var screenshotEndDate = new Date(recordingFinishedDate.getTime() + 1000 * 60 * 60)
		var screenshotStartDate = new Date(recordingFinishedDate.getTime() + 1000)
		scheduleScreenshots(screenshotStartDate, screenshotEndDate, 30, playerX, playerY, playerWidth + playerX, playerHeight + playerY, screenshotPath + getFolderLabelFromDate(recordingFinishedDate) + ".png")
		schedulePlayer(recordingFinishedDate, function() {
			playMostRecentRecording(recordingsPath, function() {
				var year = new Date().getFullYear()
				parseDateFile("data/sunriseTables/"+year+".txt", function(data) {
					var today = new Date()
					prepNextSunrise(today, data)
				})
			})
		})
	}
}

/* 	This function takes a value and converts it to a string then adds 0s at the front
	until it reaches the specified length. Useful for dates.
	If the value is longer than the target length the input is left unchanged.

	Usage:
	val 			-- value to add leading zeros to.
	targetLength 	-- integer length of the output string.

	Example:
	inputs: val = 22, targetLength = 5
	output: 00022
*/
function PadValueWithLeadingZeros(val, targetLength) {
	var v = val.toString()
	for(var i = 0; i < targetLength; i++) {
		if(v.length < targetLength) {
			v = "0" + v
		}
	}
	return v
}

/*	Given a Date object, returns a folder label

*/
function getFolderLabelFromDate(date) {
	var day 	= PadValueWithLeadingZeros(date.getDate(), 2)
	var month 	= PadValueWithLeadingZeros(date.getMonth()+1, 2)
	var year 	= PadValueWithLeadingZeros(date.getFullYear(), 2)
	var hour 	= PadValueWithLeadingZeros(date.getUTCHours() + timezoneOffset, 2)
	var minute 	= PadValueWithLeadingZeros(date.getMinutes(), 2)
	var sec 	= PadValueWithLeadingZeros(date.getSeconds(), 2)

	var label = year + "-" + month + "-" + day + "-" + hour + "-" + minute + "-" + sec
	return label
}

/*	Given a folder label string return the date.

	Folder labels are in the format: YYYY-MM-DD-HH-mm-ss
*/

function getDateFromFolderLabel(label) {
	// console.log("Folder Label Before: "+ label);
	var l 		= label.split("-")
	var year 	= l[0]
	var month 	= l[1]
	var day 	= l[2]
	var hour 	= l[3]
	var minute 	= l[4]
	var second 	= l[5]

	var date = new Date(year+"-"+month+"-"+day+"T"+hour+":"+minute+":"+second)
	return date
}

//Starts the recorder and monitors it with pm2
function startRecorder(dataPath, cameraIP, recordDuration, callback) {
	console.log("Start Recorder With Data Path: " + dataPath)
	var label = getFolderLabelFromDate(new Date())

	mkdirp(dataPath + "/" + label, function(err) {
		if(err) {
			throw err
		}
		console.log("Starting Recorder")
	  	console.log("  data-path: " + dataPath + "/" + label)
	  	console.log(`  cam-ip: ${cameraIP}`)
		console.log(`  record-for-second: ${recordDuration}`)
		  
		pm2.start({
			name: "Recorder",
			script: "bin/Parser.exe",
			args: [
				"--data-path", dataPath + "/" + label + "/" + label + ".bin", 
				"--cam-ip", cameraIP, 
				"--record-for-seconds", recordDuration
			],
			exec_mode: "fork",
			instances: "1",
			interpreter: "none",
			autorestart: false
		}, function(err, proc) {
			if(err) {
				throw err
			}
			callback();
			pm2.disconnect()
		})
	})
}

function sortRecordingDates(recPath, callback) {
	console.log(recPath)
	fs.readdir(recPath, function(err, files) {
		console.log(recPath)
		if(err) {
			throw err
		}
		var dates = []
		files.forEach(function(label) {
			var date = getDateFromFolderLabel(label)
			dates.push(date)
		})
		dates.sort(function(a, b) {
			return a>b ? -1 : a<b ? 1 : 0;
		})
		if(dates.length > 0) {
			callback(dates)
		} else {
			console.log("Could not sort dates because no recordings found in path: " + recPath)
			callback(null)
		}
	})
}

function playMostRecentRecording(recPath, callback) {
	fs.readdir(recPath, function(err, files) {
		if(err) {
			throw err
		}
		var dates = []
		files.forEach(function(label) {
			var date = getDateFromFolderLabel(label)
			dates.push(date)
		})
		if(dates.length > 0) {
			dates.sort(function(a, b) {
				return a>b ? -1 : a<b ? 1 : 0
			})
			var mostRecentDateLabel = getFolderLabelFromDate(dates[0])
			var path = recordingsPath + "/" + mostRecentDateLabel
			fs.readdir(path, function(files) {
				startPlayer(path, playerWidth, playerHeight, playerX, playerY, videoWidth, videoHeight, videoX, videoY)
			})
			callback()
		}
		else {
			console.log("No Recent Recordings were found, defaulting to Screensaver Recording")
			playScreensaverRecording(callback())
		}
	})
}

function playScreensaverRecording(callback) {
	var path = "data/screensaver"
	console.log("Playing Screensaver Recording!")
	startPlayer(path, playerWidth, playerHeight, playerX, playerY, videoWidth, videoHeight, videoX, videoY)
	if(callback) callback()
}

function playSpecificRecording(recName, callback) {
	var path = recordingsPath + "/" + recName
	console.log("Playing Specific Recording From: " + recName)
	fs.readdir(path, function(files) {
		if(fs.existsSync(path + "/settings-player.xml")) {
			startPlayer(path, playerWidth, playerHeight, playerX, playerY, videoWidth, videoHeight, videoX, videoY)
			if(callback) callback()
		} else {
			console.log("did not find settings-player.xml, recording is aparently corrupt, playing screensaver instead")
			playScreensaverRecording(callback())
		}
	})
}

// Starts the player and monitors it with pm2
function startPlayer(dataPath, windowWidth, windowHeight, windowX, windowY, videoWidth, videoHeight, videoX, videoY) {
 	console.log("Starting Player")
	console.log(`  data-path: ${dataPath}`)
	console.log(`  window-width: ${windowWidth}`)
	console.log(`  window-height: ${windowHeight}`)
	console.log(`  window-x: ${windowX}`)
	console.log(`  window-y: ${windowY}`)
	console.log(`  video-width: ${videoWidth}`)
	console.log(`  video-height: ${videoHeight}`)
	console.log(`  video-x: ${videoX}`)
	console.log(`  video-y: ${videoY}`)

	pm2.start({
		name: "Playback",
		script: "bin/Viewer.exe",
		args: [
      "--data-path", dataPath,
      "--window-width", windowWidth,
      "--window-height", windowHeight,
      "--window-x", windowX,
      "--window-y", windowY,
      "--video-width", videoWidth,
      "--video-height", videoHeight,
      "--video-x", videoX,
      "--video-y", videoY,
    ],
		exec_mode: "fork",
		instances: "1",
		interpreter: "none",
		maxRestarts: "3"
	}, function(err, proc) {
		if(err) {
			throw err
		}
		pm2.disconnect()
	})
}

function deletePlayer(callback) {
 	console.log("Stopping all players.")
    pm2.delete("Playback", function(err) {
		callback()
		console.log(err)
	})
}

function deleteRecorder(callback) {
 	console.log("Stopping all recorders.")
    pm2.delete("Recorder", function(err) {
		callback()
		console.log(err)
	})
}

function copyFile(source, target, callback) {
	var cbCalled = false

	var rd = fs.createReadStream(source)
	rd.on("error", function(err) {
		done(err)
	})
	var wr = fs.createWriteStream(target)
	wr.on("error", function(err) {
		done(err)
	})
	wr.on("close", function(ex) {
		done()
	})
	rd.pipe(wr)

	function done(err) {
		if (!cbCalled) {
			callback(err)
			cbCalled = true
		}
	}
}
// moveOldFilesToStorage
function moveOldestRecordingsToStorage(recPath, storagePath, maxRemainingRecordings, callback) {
	sortRecordingDates(recPath, function(dates) {
		if(dates == null) 
			return
		if(dates.length > 0) {
			for(var i = dates.length-1; i > maxRemainingRecordings; i--) {
				console.log(dates[i]);
				var folderDateLabel = getFolderLabelFromDate(dates[i])
				console.log("Found Old File: " + folderDateLabel)
				var currentPath = recPath + "/" + folderDateLabel
				var newPath = storagePath + "/" + folderDateLabel
				fs.move(currentPath, newPath, { overwrite: true }, function(err) {
					if(err) {
						throw err
					}
				})
				dates.pop()
			}
		}
		callback()
	})
}

function deleteOldestRecordingsInPlace(recPath, maxRemainingRecordings) {
	sortRecordingDates(recPath, function(dates) {
		if(dates == null) 
			return
		if(dates.length > 0) {
			for(var i = dates.length-1; i >= maxRemainingRecordings; i--) {
				console.log(dates[i])
				console.log(getFolderLabelFromDate(dates[i]))
				var folderDateLabel = getFolderLabelFromDate(dates[i])
				console.log("deleteOldestRecordingsInPlace::Found Old File: " + folderDateLabel)
				var path = recPath + "/" + folderDateLabel
				fs.remove(path, function(err) {
					if(err) {
						console.log(err)
					}
					console.log("Successfully deleted: " + path)
				})
				dates.pop()
			}
		}
	})
}

function deleteOldFilesInStorage(storagePath, deleteBeforeThisDate, callback) {
	sortRecordingDates(storagePath, function(dates) {
		if(dates == null) return
		dates.forEach(function(date) {
			if(date < deleteBeforeThisDate) {
				var folderDateLabel = getFolderLabelFromDate(date)
				console.log("Found Old File: " + folderDateLabel)
				var path = storagePath + "/" + folderDateLabel
				fs.remove(path, function(err) {
					if(err) {
						console.log(err)
					}
				})
				callback(date)
			}
			callback()
		})
	})
}

/* 	This is a function for taking a screenshot using chuntaro's screenshot script
	The script can be found here https://github.com/chuntaro

	Usage:
	x 			-- left coordinate of screenshot
	y 			-- top coordinate of screenshot
	r 			-- right coordinate of screenshot
	b 			-- bottom coordinate of screenshot
	fileName 	-- name of file to save to
*/
function takeScreenshot(x, y, r, b, fileName, callback) {
	pm2.start({
		name: "screenshot",
		script: "lib/screenshot-cmd/screenshot.exe",
		args: ["-rc", x, y, r, b, "-o", fileName],
		exec_mode: "fork",
		instanced: "1",
		interpreter: "none",
		autorestart: false
	}, function(err, proc) {
		if(err)
			throw err
		pm2.disconnect()
		callback()
	})
}

/* 	This function schedules a screenshot at a particular date 

	Usage:
	same as takeScreenshot with the addition(s) of...
	date 	-- The date at which to take the screenshot (javascript date object).
*/
function scheduleScreenshot(date, x, y, r, b, fileName, callback) {
	var screenshotJob = schedule.scheduleJob(date, function() {
		takeScreenshot(x, y, r, b, fileName, callback)
		// console.log("Took Screenshot: " + fileName);
	});
	return screenshotJob
}

/* 	This function schedules a set of screenshots starting at a particular date 
	(which must be in the future!) until a particular end date. 

	Usage: 
	Same as scheduleScreenshot with the additions of...
	dateStart 	-- The date to take the first screenshot.
	dateEnd 	-- The date to take the final screenshot.
	interval 	-- time between screenshots (in seconds)
*/
function scheduleScreenshots(dateStart, dateEnd, interval, x, y, r, b, fileName) {
	var now = new Date()
	if(dateStart < now)
		console.log("Warning! The start date is in the past and this function will not run!")
	var screenshotJob = scheduleScreenshot(dateStart, x, y, r, b, fileName, function() {
		var now = new Date()
		if(now < dateEnd) {
			var nextScreenshotTime = new Date(now.getTime() + interval*1000)
			// console.log("Scheduling new screenshot for: " + nextScreenshotTime);
			var name = getFolderLabelFromDate(nextScreenshotTime) // We reuse getFolderLabel from date here but not for the folder label.
			console.log(name)
			scheduleScreenshots(nextScreenshotTime, dateEnd, interval, x, y, r, b, screenshotPath + name + ".png")
		} else {
			// console.log("All screenshots taken!");
			var now = new Date()
			var convertTime = new Date(now.getTime() + 10000)
			scheduleConvertAllFilesToJpg(convertTime, screenshotPath, 60)
			return
		}
	})
}

/* 	This function takes a directory path and converts all the images inside from pngs to jpgs.
	Does not work recursively, ignores all other files.
	
	Usage:
	filename 	-- path to file to be converted
*/
function convertAllFilesToJpg(filePath) {
	fs.readdir(filePath, function(err, files) {
		if(err)
			throw err
		var pngs = []
		files.forEach(function(fileName) {
			var extension = fileName.split(".")
			var fileTitle = extension[0]
			extension = extension[extension.length - 1]
			if(extension == "png") {
				sharp(screenshotPath + fileName)
				.toFile(screenshotPath + fileTitle + '.jpg')
				.then( data => 
					fs.remove(screenshotPath + fileName, function(err) {
						if(err) {
							throw err
						}
					})
				)
			}
		})
	})
}

/* 	This function schedules a "convert all files to jpg" call at a date in the future.
	
	Usage:
	date 		-- javascript date object to schedule conversion of all png files to jpg
	filename 	-- path to file to be converted
*/
function scheduleConvertAllFilesToJpg(date, filePath) {
	var convertJob = schedule.scheduleJob(date, function() {
		convertAllFilesToJpg(filePath)
	})
}