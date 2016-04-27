/*jshint -W043 */
//require the Twilio module and create a REST client
//TODO: Enter your twilio API keys here!
var client = require('twilio')('', '');
var async = require("async");
var SerialPort = require("serialport").SerialPort;
var serialPortScanner = require("serialport");
var serialPort;
var exec = require('child_process').exec;

// Phone number logic
// TODO: Insert your phone number here. This will recieve phone calls. 
var PhoneNumber = ''; 


//TODO: enter your twilio number here
var twilioNumber =  '';

// Webmail Functionality ALSO just google nodemailer for API docs
var nodemailer = require('nodemailer');
// create reusable transporter object using the default SMTP transport
// TODO: Enter email address here with password
var transporter = nodemailer.createTransport('smtps://YOUREMAIL%40gmail.com:PASSWORD@smtp.gmail.com');

// Variables for email data to be filled in
var emailHtml = '';
var emailText = '';
var emailSubject = '';
// TODO: put in your email here
var emailRecipient = '';
var sleepStartDate = new Date();
var sleepEndDate = new Date();

// Email alert Mechanism
// Requires inputs of:
  // Date in bed (use object date object; google if necessary - note this records date + time)
  // Date woke up (use date object)
  // Vector of sleeping indices for each eleventh of the night, varying from
      // Wide awake: 0; dead asleep: 100, e.g.
      // [0, 30, 80, 40, 90, 100, 60, 80, 50, 20, ,0]
  // Baby weight in pounds
  // Average baby temperature in degrees F

var emailUpdate = function(dateInBed, dateWokeUp, sleepVector, reportWeight, reportTemp) {
	// send mail with defined transport object
  htmlCreator(dateInBed, dateWokeUp, sleepVector, reportWeight, reportTemp);

  // Fill in mail options, notably html and subject
  var mailOptions = {
      from: '"ICE ICE Baby Cribs" <iceicebabycrib@gmail.com>', // sender address
      to: emailRecipient, // list of receivers
      subject: emailSubject, // Subject line
      text: emailText, // plaintext body
      html: emailHtml // html body
  };
  transporter.sendMail(mailOptions, function(error, info){
	    if(error){
          console.log('error sending mail');
	        return console.log(error);
	    }
	    console.log('Message sent: ' + info.response);
	});
};

//The "Soothe" state
var sootheState = function() {
  console.log('The Crib is in the Soothe state and played music.'); //Placeholder
  if(!dontPlayMusic) {
    playMusic(); //Play music here.
    dontPlayMusic = true;
  }
};

//The "Warning" state
var warningState = function() {
  console.log('The Crib is in the Warning state.'); //Placeholder
  textAlert('Your baby has a fever! Get to your baby!'); //Text the parents
  callAlert();
  //Added above commented-out code (incrementing msgFlags) into textAlert() directly.
};

// Send a text through Twilio to defined phone number
var textAlert = function(inputMessage) {
	//Send an SMS text message
  msgFlags++; //Added by Jonathan, April 3rd
	client.sendMessage({

	    to: PhoneNumber, // Any number Twilio can deliver to
	    from: twilioNumber, // A number you bought from Twilio and can use for outbound communication
	    body: inputMessage // body of the SMS message

	}, function(err, responseData) { //this function is executed when a response is received from Twilio

	    if (!err) { // "err" is an error received during the request, if any

	        // "responseData" is a JavaScript object containing data received from Twilio.
	        // A sample response from sending an SMS message is here (click "JSON" to see how the data appears in JavaScript):
	        // http://www.twilio.com/docs/api/rest/sending-sms#example-1

	        console.log(responseData.body); // outputs body sent

	    } else {
        console.log('error sending text');
        console.log(err);
      }
	});
};

// Call through Twilio to defined phone number
var callAlert = function() {
	//Place a phone call, and respond with TwiML instructions from the given URL
  msgFlags++; //Added by Jonathan, April 3rd
	client.makeCall({
	    to: PhoneNumber, // Any number Twilio can call
	    from: '+17706285137', // A number you bought from Twilio and can use for outbound communication
	    url: 'https://demo.twilio.com/welcome/voice/' // A URL that produces an XML document (TwiML) which contains instructions for the call
	}, function(err, responseData) {
      if(err) {
        console.log('error calling phone');
        console.log(err);
      } else {
        //executed when the call has been initiated.
  	    console.log(responseData); // outputs "+14506667788"
      }
	});
};

// List Serial ports available. Used for debug only.
var listPorts = function() {
	serialPortScanner.list(function (err, ports) {
	  ports.forEach(function(port) {
	    console.log(port.comName);
	  });
	});
};

// Function to run to initialize connection to Arduino.
var initArduino = function(postConnection) {
	serialPortScanner.list(function (err, ports) {
		async.each(ports, function(port, callback) {
			console.log(port.comName);
			if(port.manufacturer !== undefined && port.manufacturer.indexOf('Arduino') > -1) {
	    		console.log('Connected to ' + port.comName);
				serialPort = new SerialPort(port.comName, {
					baudrate: 115200,
					parser: serialPortScanner.parsers.readline("\n")
				});
				serialPort.on("open", function () {
					console.log('Serial port opened!');
					serialPort.flush();
					serialPort.on('data', function(data) {
				    	dataHandler(data);
					});
					postConnection();
				});
	    	}
		});
	});
};

// Post Connection Initialization Logic Here
var postConnection = function() {
	console.log('Connection successful');
};


//Declare global variables out here, like flags
var cryFlags = 0;
var feverFlags = 0;
var movingFlags = 0;

//Make a call/text flags, so that the calling/texting doesn't get out of hand.
var msgFlags = 0;

//Creates array of values that will correspond to readings of sound/temp
//over time.
var cryArray = new Array(0,0,0,0,0);
var feverArray = new Array(0,0,0,0,0);

var cryThresh = 60; //Any value >cryThresh --> Baby is crying
var feverThresh = 99; //Any value >feverThresh --> Baby has fever [Fahrenheit]
var msgThresh = 3; //There are three types of messages to be sent. That is the threshold.


var count = 0;

var velX = new Array(0,0,0,0,0,0,0,0,0);
var velY = new Array(0,0,0,0,0,0,0,0,0);

var prevvelX = 0;
var prevvelY = 0;

var sumvelX = 0;
var sumvelY = 0;

var velavgX = 0;
var velavgY = 0;

var weightConv = 0.027302; //unitless to Pounds
var weight = 0;

var dataArr = []; //initialization of data array that will be used to calculate average stuff for email stuff.
var velXGraph = 0;
var velYGraph = 0;

var numBins = 10; //This is the number of bins for the graph
var graphArr = []; //THIS IS THE ARRAY THAT GETS SENT TO ALEC's EMAIL
var weightArr = [];
var avgWeight = 0;
var tempArr = [];
var avgTemp = 0;


var Decrement = true;
var dontText = false; //used for moving flags
var dontVibrate = false;
var dontPlayMusic = false;


// Function to run whenever data is received from Arduino
// Default "Normal" state
var dataHandler = function(data) {
	// Jonathan is working here

  //So the idea of the message flags is that we don't want to text the parent
  //more than once per 10 minutes.
  //So, since this loop loops once every second, lets exploit that.
  //A variable count will be incremented every loop (and thus every second)
  //when count == 10*60 (aka every 10mins) the message flags will be reset,
  //allowing for messages to be resent.
  count++;
  if (count%(10*60) === 0) {
    count = 0; //reset counter
    msgFlags = 0; //allow messages to be sent again
  }

	// Data comes in as a JSON string; next line just turns it into Javascript readable JSON
	// Current API: data.cog refers to an array of XY positions taken since the program last sent up data
	// data.cog[0].x refers to the first X coordinate; data.cog[0].y refers to the first y coordinate.
	// data.cog[1].x refers to the second X coordinate, etc.


	try{
    data = JSON.parse(data); // Parse data into JSON. Logging is just so you can see what's going on.

    weight = data.weight * weightConv;
    if (~isNaN(weight)){
    weightArr.push(weight);}
    else {
      //do nothing, i.e., do NOT add weight to weightArr.
    }

    if(true){
      console.log('Weight:' + weight);
      console.log('Temp:' + data.temp[0].t1 + ',' + data.temp[0].t2 + ',' + data.temp[0].t3);
      console.log('XY:' + data.cog[0].x + ',' + data.cog[0].y);
    }

    if(data.startendflag === 1) {
      console.log("sleep started");
      sleepStartDate = new Date();
      dataArr = [];
      weightArr = [];
      avgWeight = 0;
      tempArr = [];
      avgTemp = 0;
    } else if (data.startendflag === 2) {
      console.log("sleep ended");
      sleepEndDate = new Date();
            //If it is the end of the sleep cycle, develop the graph points.
      if (data.startendflag === 2){
        console.log('end of data');
      //graph points
      var indicesPerBin = Math.floor(dataArr.length / numBins);
      // if the length of the data is less than the number of bins, let each index be a bin.
      if (dataArr.length < numBins){
        indicesPerBin = 1;
        numBins = dataArr.length;
      }
      //Take the average per bin, assign it to the kth bin
      for(var k = 0; k < numBins; k++){
        graphArr[k] = 0;
        for (var m = 0; m < indicesPerBin; m++){
          console.log('data arr: ' + dataArr[k*indicesPerBin+m]);
          if (!isNaN(dataArr[k*indicesPerBin+m])){
          graphArr[k] = graphArr[k] + dataArr[k*indicesPerBin+m]/indicesPerBin;
          console.log('graph arr: ' + graphArr[k]);
        }
        }
      }

      //avg weight
      for (var i = 0; i < weightArr.length; i++){
        avgWeight = avgWeight + weightArr[i]/weightArr.length;
      }

      //avg temperature
      for (var p = 0; p < tempArr.length; p++){
        avgTemp = avgTemp + (tempArr[p])/(tempArr.length);
      }
      var themax = Math.max.apply(null, graphArr);
      for(var i4 = 0; i4< graphArr.length; i4++) {
        graphArr[i4] = 100*(1-graphArr[i4]/themax);
      }
      //graphArr = 100*(1-graphArr/;

      console.log('Average Weight: ' + avgWeight);
      console.log('Average Temperature: ' + avgTemp);
      console.log('Graph Array: ' + graphArr);
      emailUpdate(sleepStartDate, sleepEndDate, graphArr, avgWeight, avgTemp);
      serialPort.write('0,0');
      numBins = 10; //reset number of bins
      }
    }


    if (weight < 0.4){
      //if weight is less than .4 lbs, do nothing
    }
    else {
    	//ALWAYS remove the last element of the array and add the newest data
    	//measurement in the data array.
      var avgcry = 0;
      for(var i3 = 0; i3<data.cry.length; i3++) {
        avgcry += Math.abs(data.cry[i3].val)/data.cry.length;
      }
      console.log("cry value: " + avgcry);
    	cryArray.unshift(avgcry); //adds the data onto the beginning of the array
    	cryArray.pop(); //removes the reading that was taken the longest time ago

      var tempHolder = (data.temp[0].t1 + data.temp[0].t2 + data.temp[0].t3)/3;
    	feverArray.unshift(tempHolder); //do the same for feverArray
    	feverArray.pop();

      if (~isNaN(tempHolder)){
      tempArr.push(tempHolder);}
      else {
        //do nothing, i.e., dont push tempholder if its a nan
      }


    	//Use the latest audio/temp readings for logic below.
    	var newestCryReading = cryArray[0];
    	var newestFeverReading = feverArray[0];

    	//Use the latest x and y coordinates.
    	var newestX = data.cog[data.cog.length - 1].x;
    	var newestY = data.cog[data.cog.length - 1].y;

    	var BabyIsCrying = (newestCryReading >= cryThresh);
    	var BabyHasFever = (newestFeverReading >= feverThresh);

    	//Whenever baby is crying, cryFlags++
    	if (BabyIsCrying && Decrement && !dontPlayMusic){
    		cryFlags++;
        console.log('Cry Flags: ' + cryFlags);
    	} else{

        if (cryFlags > 0 && Decrement){
    		cryFlags--;
      }
    	}

    	//Whenever baby has fever, feverFlags++
    	if (BabyHasFever){
    		feverFlags++;
    	} else{
        if (feverFlags > 0){
    		feverFlags--;
      }
    	}

    	//Determine if the baby is crying. Since this program loops every second, if
    	//the number of flags is equal to 5, then the program will have processed
    	//crying for 5 seconds.
    	var flagThresh = 10;

    	if (cryFlags >= flagThresh/2){
    		//...Baby is crying. Put necessary actions here
    		//i.e., text the parent, soothe baby, etc.
        sootheState();
        cryFlags = 0; //reset whenever baby is successfully soothed.
    	}
    	//Same logic applies for determining if the baby has a fever.
    	if (feverFlags == flagThresh/2){
    		//...Baby has fever/high temp. Put necessary actions here.
    		//i.e., text the parent, soothe baby, etc.
        warningState();
        feverFlags = 0;
      	}
    //Moving Portion
      //Domain of values is [0,10000]U[0,10000]
      //So the idea is that the baby shouldnt be moving too much over a given period.
      //Since each measurement is uniformly measured every 1sec, we define that the
      //baby is moving too much when the difference between readings is >= 10% of the
      //crib length.

      //Create the velocities and add their values to moving avg.
      //These velocities are for x and y coordinates. But in reality, we care more
      //about Cartesian velocity, so we will eventually take their least-squares Norm
      //(i.e., (vX^2 + vY^2)^(1/2) )

      for (i = 0; i < velX.length; i++){
        velX[i] = (data.cog[i+1].x - data.cog[i].x) / 0.1;
        velY[i] = (data.cog[i+1].y - data.cog[i].y) / 0.1;
      }

  //Saving data for graph:
      for (i = 0; i < velX.length; i++){
        velXGraph = velXGraph + velX[i]/velX.length;
        velYGraph = velYGraph + velY[i]/velX.length;
      }
      var velAvgGraph = Math.sqrt(velXGraph*velXGraph + velYGraph*velYGraph);
          dataArr.push(velAvgGraph); //add average cartesian velocity
          //reset variables
          velAvgGraph = 0;
          velXGraph = 0;
          velYGraph = 0;

      //now we have the velocities! So lets do a few things.
      //First, the following for-loop adds the velocities to an overall sum.
      //
      //crib dimensions: 19" horizontally x 35.5" vertically
      for (i = 0; i < velX.length; i++){
        sumvelX += Math.abs(velX[i])/velX.length;
        sumvelY += Math.abs(velY[i])/velY.length;
      }

      //moving average.
      velavgX = 0.1*prevvelX + 0.9*sumvelX;
      velavgY = 0.1*prevvelY + 0.9*sumvelY;

      //Make the current average velocities the previous velocities
      //also, reset the present sum variables.
      prevvelX = velavgX;
      prevvelY = velavgY;
      sumvelX = 0;
      sumvelY = 0;

      //we care about moving in any direction, so take the cartesian norm of
      //the two average velocities.
      var velavg = Math.sqrt(velavgX*velavgX + velavgY*velavgY);

      //Output to the console, for debugging.
      console.log('Cartesian Vel' + velavg);

      //if the baby is moving at a rate of 5% of the crib length per second, any direction, then
      var BabyRestless = (velavg > ((0.05)*10000));

      if (BabyRestless){
        movingFlags++;
      // In the future we want to check difference of movement.
    	  console.log('Moving Flags: ' + movingFlags);
      } else{
        if (movingFlags > 0){movingFlags--;}
      }

    	if (movingFlags == 10){
        if (!dontVibrate){
          Decrement = false;
        sootheVibrate(20);
        dontVibrate = true;
        setTimeout(function(){ dontVibrate = false; }, 180000); //allow texts after 3 mins (180000ms)
      }
        // THIS IS how you call soothe vibrate. input true for on; false to turn it off.
        // sootheVibrate(true);
    	} if (movingFlags >= 15) {
        if (!dontText){
        textAlert('Your baby is moving too much!');
        dontText = true;
        setTimeout(function(){ dontText = false; }, 600000); //allow texts after 10 mins (600000ms)
        }
    	} if (movingFlags == 20) {
    	   callAlert();
         movingFlags = 0;
    	}



    }
  } catch(err) {
      console.log('error parsing JSON');
      console.log(err);
      console.log(data);
    }

};


// Alex added this
// When called, should play music, but we will have to sort this out with the Pi.
// Current implementation just calls exec. This will only work for one file
var playMusic = function() {
	exec('omxplayer -o local IceIceBaby_Final.mp3 &', function(error, stdout, stderr) {
          console.log(stdout);
          dontPlayMusic = false;
    });
};

// Turns on or off soothing vibration generator for input time in seconds
var sootheVibrate = function(sootheLength) {
  console.log('turning on vibration');
  serialPort.write('1,1');
  setTimeout(function() {
    console.log('turning off vibration');
    serialPort.write('0,0');
    Decrement = true;
  }, sootheLength*1000);
};


var htmlCreator = function(dateInBed, dateWokeUp, sleepVector, reportWeight, reportTemp) {

  var reportDate = dateInBed.toLocaleDateString();
  var bedTime = dateInBed.toLocaleTimeString();
  var wakeTime = dateWokeUp.toLocaleTimeString();
    var timeDiff = Math.floor((dateWokeUp.getTime() - dateInBed.getTime())/1000/60); // Gets time in minutes
    var minString = timeDiff%60;
    if(minString<10) {
      minString = '0' + minString;
    }
  var sleepTime = Math.floor(timeDiff/60) + ':' + minString;

  var htmlSleepVector = '';
  for(var i = 0; i<sleepVector.length; i++) {
    htmlSleepVector += (i*100/sleepVector.length) + ',' + sleepVector[i] + ' ';
  }

  var timesVector = '';
  var tempDate = dateInBed;
  for(var j = 0; j<5; j++) {
    tempDate.setMinutes(tempDate.getMinutes()+timeDiff/5);
    var tempDateHours = tempDate.getHours()%12;
    if (tempDateHours === 0) {
      tempDateHours = 12;
    }
    var tempDateMinutes = tempDate.getMinutes();
    if(tempDateMinutes<10) {
      tempDateMinutes = '0' + tempDateMinutes;
    }
    timesVector += '<td>' + tempDateHours + ':' + tempDateMinutes + '</td>';
  }

  var s1 = '<div style=\"font-family:\'Trebuchet MS\', Helvetica, sans-serif; background-color: FFF; color:#444\"> \
    <div style=\"width:80%; background-color:#E0DFFF; margin:auto; border-radius: 12px; padding:20px; min-width:500px; max-width:800px\"> \
    <div style=\"width:100%; text-align:center\"> \
    <h2> \
    Sleep Report for ';

  var s2 = reportDate;

  var s3 = '</h2> \
    </div> \
    <br /> \
    <table style=\"width:100%; color:#444\"> \
    <tr> \
    <td valign=\"center\" style=\"text-align:center; min-width:250px\"> \
    <p> \
    <span style=\"font-size:24px\">Sleep Time<br /></span> \
    <span style=\"font-size:50px\">';

  var s4 = sleepTime;

  var s5 = '</span> \
    </p> \
    <p> \
    <span style=\"font-size:18px;\"> \
    Went to Bed: ';

  var s6 = bedTime;

  var s7 = '<br /> \
    Woke Up: ';

  var s8 = wakeTime;

  var s9 = ' \
    </span> \
    </p> \
    </td> \
    <td width=\"60px\"> \
    <table style=\"height:100%; width:100%; display:inline-block; text-align:right; color:#444\" cellpadding=\"0\" cellspacing=\"0\"> \
    <tr> \
    <td valign=\"center\"> \
    Awake \
    </td> \
    </tr> \
    <tr> \
    <td valign=\"center\"> \
    Light Sleep \
    </td> \
    </tr> \
    <tr> \
    <td valign=\"center\"> \
     Medium Sleep \
    </td> \
    </tr> \
    <tr> \
    <td valign=\"center\"> \
    Deep Sleep \
    </td> \
    </tr> \
    </table> \
    </td> \
    <td valign=\"center\" style=\"text-align:center; min-width:160px\"> \
    <div style=\"padding:10px; padding-top:20px; background: linear-gradient(#7284D5, #434D7D); \
    border-radius:12px; width:90%; margin-left:2%; margin-right:8%; margin-top:5%; margin-bottom:6px\"> \
    <svg width=\"100%\" viewBox=\"0 0 100 100\" preserveAspectRatio=\"xMaxYMax meet\"> \
    <polyline \
     fill=\"none\" \
     stroke=\"#DDD\" \
     stroke-width=\"2\" \
     points=\" ';

  var s10 = htmlSleepVector;

  var s11 = '\"/> \
    </svg> \
    </div> \
    <table border=\"0\" cellpadding=\"0\" cellspacing=\"0\" \
    style=\"width:100%; text-align:center; color:#444; table-layout:fixed\"> \
    <tr>';

  var s12 = timesVector;

  var s13 = '</tr> \
    </table> \
    </td> \
    </tr> \
    </table> \
    <p> \
    Weight: ';

  var s14 = reportWeight;
  s14 = s14*10;
  s14 = Math.round(s14);
  s14 = s14/10;

  var s15 = ' lbs<br /> \
    Average Temperature: ';

  var s16 = reportTemp;
  s16 = s16 * 10;
  s16 = Math.round(s16);
  s16 = s16/10;

  var s17 = 'F \
    </p> \
    </div> \
    </div>';

  emailHtml = s1+s2+s3+s4+s5+s6+s7+s8+s9+s10+s11+s12+s13+s14+s15+s16+s17;
  emailText = 'text here';
  emailSubject = 'Sleep Report for ' + reportDate;
};
initArduino(postConnection);
