var express = require('express');
var app = express();
var server = require('http').createServer(app);

var mqtt = require('mqtt')
var mqttClient = mqtt.connect('mqtt://mbroker.forgerocklabs.net/')

var W3CWebSocket = require('websocket').w3cwebsocket;
var wsClient = new W3CWebSocket('ws://mbroker.forgerocklabs.net/', 'echo-protocol');

var io = require('socket.io')(server);

var base64 = require('base-64');

var cors = require('cors');
app.use(cors());
app.options('*', cors());

var bodyParser = require('body-parser');
app.use(express.static(__dirname));
app.use(bodyParser.json());

const webPush = require('web-push');
var pushSubscription;

var opbeat = require('opbeat').start({
  appId: '907f105189',
  organizationId: 'a4e28844078e4e7f8b7b0ea31d243593',
  secretToken: '0ae0e3d54951fe60c3319d63c7d8982902894fc0'
})

app.use(opbeat.middleware.express())

// The GCM API key is AIzaSyDNlm9R_w_0FDGjSM1fzyx5I5JnJBXACqU
webPush.setVapidDetails(
    'mailto:salnikov@gmail.com',
    'BHe82datFpiOOT0k3D4pieGt1GU-xx8brPjBj0b22gvmwl-HLD1vBOP1AxlDKtwYUQiS9S-SDVGYe_TdZrYJLw8',
    's-zBxZ1Kl_Y1Ac8_uBjwIjtLtG6qlJKOX5trtbanAhc'
);

app.post("/subscription", function(req, res, next) {

    if (req.body.action === 'subscribe') {
        pushSubscription = req.body.subscription;

        console.log('Subscription registered: ')
        console.log(JSON.stringify(pushSubscription, null, 2))

    } else {
        throw new Error('Unsupported action');
    }

    res.send({
        text: 'Subscribed',
        status: "200"
    });
});

function sendNotification(payload) {

    if (pushSubscription) {

        webPush.sendNotification(pushSubscription, payload)
            .then(function(response) {
                console.log("Push sent");
                //console.log(JSON.stringify(response, null, 2))
            })
            .catch(function(err) {
                console.error("Push error: " + err);
            });

    }
}

function sendToBrowser(messageContent) {

    messageContent.notification = {
        title: messageContent.topic,
        body: messageContent.message
    }

    io.emit('deviceMessage', messageContent);
    sendNotification(JSON.stringify(messageContent))

}

// MQTT Client

mqttClient.on('connect', function() {
    console.log('MQTT Client connected');
    mqttClient.subscribe('#')
})

mqttClient.on('message', function(topic, message) {

    console.log('Message from MQTT Client received')
    console.log('Topic:' + topic.toString())
    console.log('Message:' + message.toString())

    var messageContent = {
        topic: topic.toString(),
        message: message.toString()
    }

    sendToBrowser(messageContent);

})



// Browser connection

io.on('connection', function(socket) {

    console.log('Browser connected');

    socket.on('disconnect', function() {
        console.log('Browser disconnected');
    });

    socket.on('deviceMessage', (messageContent) => {

        console.log('Message from browser received')
        console.log('Topic:' + messageContent.topic)
        console.log('Message:' + messageContent.message)

        // Sending to browser
        io.emit('deviceMessage', messageContent);

        // Sending to MQTT client
        mqttClient.publish(messageContent.topic, messageContent.message)

        // Sending to WS client
        if (wsClient.readyState === wsClient.OPEN) {
            wsClient.send(JSON.stringify(messageContent));
        }

    });

});

// WS client

wsClient.onerror = function() {
    console.log('WebSocket Client Connection Error');
};

wsClient.onopen = function() {
    console.log('WebSocket Client Connected');
};

wsClient.onclose = function() {
    console.log('WebSocket Client Closed');
};

wsClient.onmessage = function(e) {
    if (typeof e.data === 'string') {

        console.log("Message from MQTT Client: '" + e.data + "'");
        sendToBrowser(e.data);

    }
};


// Starting server

server.listen(process.env.PORT || 3001, function() {
    console.log('Listening on port ' + ( process.env.PORT || 3001 ))
})
