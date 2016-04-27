#include "timer.h"
#include "i2cmaster.h"
#include "HX711.h"

#define MIC1_PIN 1
#define PUSH_BUTTON 2
#define LED_PIN 3
#define SCALE_1_SCK 4
#define SCALE_1_DOUT 5
#define SCALE_2_SCK 6
#define SCALE_2_DOUT 7
#define SCALE_3_SCK 8
#define SCALE_3_DOUT 9
#define SCALE_4_SCK 10
#define SCALE_4_DOUT 11


// Scale variables
HX711 scale1(SCALE_1_DOUT, SCALE_1_SCK);    // parameter "gain" is ommited; the default value 128 is used by the library
HX711 scale2(SCALE_2_DOUT, SCALE_2_SCK);
HX711 scale3(SCALE_3_DOUT, SCALE_3_SCK);
HX711 scale4(SCALE_4_DOUT, SCALE_4_SCK);


// Timer object to handle periodic polling / transmission
Timer timer;

// Counter to measure number of samples that have been taken
int counter = 0;

// Polling Rate (currently of all sensors but may do polling at different speeds) in Hz
const int POLLING_RATE = 10;
// Transmit period in seconds; i.e. 1 = transmit back to Pi once / second
const int TRANSMIT_PERIOD = 1;
// Number of samples being transmitted
const int NUM_SAMPLES_TRANSMITTED = POLLING_RATE*TRANSMIT_PERIOD;
// This is the length of the arrays storing data
const int POS_LENGTH = NUM_SAMPLES_TRANSMITTED;
const int CRY_LENGTH = NUM_SAMPLES_TRANSMITTED;
// This is the number of temperatures sensors
const int TEMP_SENSORS = 5;



// Array of xy positions (currently with dummy values for test purposes).
// Will eventually get rid of array it's set equal to; i.e.
// Change this line to float xyPos[POS_LENGTH][2];
// These arrays will store the temporary data before it's sent.
int xyPos[POS_LENGTH][2];

// Array of temperature data for each sensor set to 0
float tempData[TEMP_SENSORS];
float ephemeralTemps[TEMP_SENSORS];

// Array of data for crying
float cryData[CRY_LENGTH];

// Weight variable
float babyWeight;

// Variables for button debounce funtion
unsigned long lastDebounceTime = 0;
unsigned long debounceDelay = 500;

// Transfer Data State
bool transfer_data = 0;

// Start / end flag
int startEndFlag = 1;

// General setup
void setup() {
  Serial.begin(115200);
  Serial.setTimeout(100);

  // setup vibration generator
  pinMode(13, OUTPUT);
  // Setup interrupt pin
  pinMode(LED_PIN, OUTPUT);
  attachInterrupt(digitalPinToInterrupt(PUSH_BUTTON), buttonPress, FALLING);
 
  zeroData();
  // Chain readAll function to every polling interval
  timer.every(1000/POLLING_RATE, readAll);


  // Setup I2CBus
  i2c_init(); //Initialise then,
  //PORTC = (1 << PORTC4) | (1 << PORTC5); //enable pullups

  // Scale configration
  //Serial.println("about to set up scales");
  scale1.set_scale(2280.f);                      // this value is obtained by calibrating the scale with known weights; see the README for details
  scale1.tare();               // reset the scale to 0
  //Serial.println("s1");
  scale2.set_scale(2280.f);
  scale2.tare();
  //Serial.println("s2");
  scale3.set_scale(2280.f);
  scale3.tare();
  //Serial.println("s3");
  scale4.set_scale(2280.f);
  scale4.tare();
  //Serial.println("s4");
}

// Runs this loop ad infinitum
void loop() {
  // Check up on timer
  
  timer.update();
}

// Function that reads all of everything
void readAll() {
    // Run all the reading functions
    if (transfer_data == 1) {
  readTemps();
  readCry();
  readPos();
  // Checks to see if any commands should be run like turn on vibration generator
  checkSerial();


  // Ever time we've read the number of samples that should be transmitted, send and zero
  if(counter++ >=NUM_SAMPLES_TRANSMITTED-1) {
    sendData();
    zeroData();
  }
    }
}

void vibration(bool tval){
if(tval == false) {
      digitalWrite(13, LOW);
    } else if(tval== true) {
      digitalWrite(13, HIGH);
    }
}
// Check to see if there is a command coming in from Pi.
void checkSerial() {
  if(Serial.available()) {
    // 0 = turn off vibration generator
    // 1 = turn on vibration generator (and more numbers can mean more things that we add later on)
    int d1 = Serial.parseInt();
    int d2 = Serial.parseInt(); // Checksum
    if(d1==d2) {
      if(d1==1) {
        vibration(true);
      } else if(d1==0) {
        vibration(false);
      }
    }
  }
}

void buttonPress() {
    if ((millis() - lastDebounceTime) > debounceDelay) {
      transfer_data = !transfer_data;
      if (transfer_data == 1) {
        scale1.tare();               
        scale2.tare();
        scale3.tare();
        scale4.tare();
        digitalWrite(LED_PIN, HIGH);
        startEndFlag = 1;
        sendData();
        startEndFlag = 0;
      }
      else {
        digitalWrite(LED_PIN, LOW);
        startEndFlag = 2;
        sendData();
        startEndFlag = 0;
      }
      lastDebounceTime = millis();
    }

}

// Function to read baby temperature data
void readTemps() {
  // Put each reading into an ephemeral temperature array
  // So all of these will actually be either a pin read or something.

  // addresses from the scanner
  ephemeralTemps[0] = readIRDevice(0x55);
  ephemeralTemps[1] = readIRDevice(0x5A);
  ephemeralTemps[2] = readIRDevice(0x54);
  ephemeralTemps[3] = 0;
  ephemeralTemps[4] = 0;

  // Transfer temperature data into temperature data array
  for(int i = 0; i < TEMP_SENSORS; i++) {
    tempData[i] = tempData[i] + ephemeralTemps[i]/POLLING_RATE;
  }
}

int readMic(int micAddress) {
  return abs(analogRead(micAddress)-512);
}

float readIRDevice(int address)
{
  int dev = address << 1;
  int data_low = 0;
  int data_high = 0;
  int pec = 0;

  // RAW READ
  i2c_start_wait(dev + I2C_WRITE);

  i2c_write(0x07);

  i2c_rep_start(dev + I2C_READ);

  data_low = i2c_readAck(); //Read 1 byte and then send ack
  data_high = i2c_readAck(); //Read 1 byte and then send ack
  pec = i2c_readNak();
  i2c_stop();

  //This converts high and low bytes together and processes temperature, MSB is a error bit and is ignored for temps
  double tempFactor = 0.02; // 0.02 degrees per LSB (measurement resolution of the MLX90614)
  double tempData = 0x0000; // zero out the data
  int frac; // data past the decimal point

  // This masks off the error bit of the high byte, then moves it left 8 bits and adds the low byte.
  tempData = (double)(((data_high & 0x007F) << 8) + data_low);
  tempData = (tempData * tempFactor)-0.01;

  //Process tempData
  float celcius = tempData - 273.15;
  float fahrenheit = (celcius*1.8) + 32;
  delay(50);
  return fahrenheit;

}

// Function to read baby crying data
void readCry() {
  cryData[counter] = readMic(MIC1_PIN);
}


// Function to read baby position and weight
void readPos() {

  float scale1read = scale1.get_units();
  float scale2read = scale2.get_units();
  float scale3read = scale3.get_units();
  float scale4read = scale4.get_units();
  float weight = scale1read+scale2read+scale3read+scale4read;
  float xPos = 10000*(scale2read+scale4read)/weight;
  float yPos = 10000*(scale1read+scale2read)/weight;

  // Store XY positions
  xyPos[counter][0] = xPos;
  xyPos[counter][1] = yPos;
  // Keep track of weight
  // Subtraction because sensors are oriented upside down
  babyWeight = babyWeight - weight/POLLING_RATE;
}




// Zeroes all data. Should be run every time data is sent up to the mothership.
void zeroData() {
  // Zero counter
  counter = 0;
  // Zero weight
  babyWeight = 0;
  // Zero Temperature data
  for(int i = 0; i < TEMP_SENSORS; i++) {
    tempData[i] = 0;
  }
  // Zero cry data
  for(int i = 0; i < CRY_LENGTH; i++) {
    cryData[i] = 0;
  }
  // Zero xy data
  for(int i = 0; i < POS_LENGTH; i++) {
    xyPos[i][0] = 0;
    xyPos[i][1] = 0;
  }
}

// Sends data from temperature array, cry array, and COG array. Will simply send whatever is in them.
void sendData() {
  // Open JSON array
  Serial.print("{");

  // Send COG data
  Serial.print("\"cog\":[");
  for(int i = 0; i<POS_LENGTH; i++) {
    Serial.print("{\"x\":");
    Serial.print(xyPos[i][0]);
    Serial.print(",\"y\":");
    Serial.print(xyPos[i][1]);
    Serial.print("}");
    if(i!=POS_LENGTH-1) {
      Serial.print(",");
    }
  }
  Serial.print("],");

  // Send temperature data
  Serial.print("\"temp\":[");
  Serial.print("{");
  // Send data for each sensor:
  for(int i = 0; i<TEMP_SENSORS; i++) {
    Serial.print("\"t");
    Serial.print(i+1);
    Serial.print("\":");
    Serial.print(tempData[i]);
    if(i!=TEMP_SENSORS-1) {
      Serial.print(",");
    }
  }
  Serial.print("}");
  Serial.print("],");

  // Send cry data
  Serial.print("\"cry\":[");
  for(int i = 0; i<CRY_LENGTH; i++) {
    Serial.print("{\"val\":");
    Serial.print(cryData[i]);
    Serial.print("}");
    if(i!=CRY_LENGTH-1) {
      Serial.print(",");
    }
  }
  Serial.print("],");

  // Send weight data:
  Serial.print("\"weight\":");
  Serial.print(babyWeight);

  // Send start/end flag
  Serial.print(",\"startendflag\":");
  Serial.print(startEndFlag);
  //Close out JSON array
  Serial.print("}");
  Serial.println();
}
