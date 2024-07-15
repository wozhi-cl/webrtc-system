/*
 */
const cookieParser = require('cookie-parser')
const webpack = require('webpack')
const WebpackDevServer = require('webpack-dev-server')
const webpackConfig = require('../../build/webpack.client')
const config = require('../../config/index.js')
const route = require('./route')
const { data } = require('./mock')
const util = require("util");
const { createServer } = require("http");
const { Server } = require("socket.io")
const { instrument } = require("@socket.io/admin-ui");

const compiler = webpack(webpackConfig)

const httpServer = new WebpackDevServer(compiler, {
  hot: true,
  inline: true,
  stats: { colors: true },
  disableHostCheck: true,
  publicPath: '/',
  historyApiFallback: {
    index: '/index.html',
  },
  proxy: {},

  before(app) {
    app.use(cookieParser())
    /**
     * root 路径路由，校验token和system
     */
    app.use('/', route)

    /**
     * 生成mock.js数据，并返回给前端对接口
     */
    app.get('/test/api', (req, res) => {
      res.json(data)
    })


  },

  onListening: function (devServer) {
    if (!devServer) {
      throw new Error('webpack-dev-server is not defined');
    }


  },
})
// app.listen(config.port, config.host, (error) => {
//   if (error) {
//     console.log(error)
//   }
//   console.log('%s: Node server started on %s:%d ...', new Date(), config.host, config.port)
// })

// const httpServer = createServer(app);
// httpServer.startCallback(() => {
//   console.log('Successfully started server on http://localhost:8080');
// });

const io = new Server(httpServer.listeningApp, {
  // namespaceName: "/admin",
  cors: {
    origin: ["https://admin.socket.io"],
    credentials: true
  }
});
instrument(io, {
  auth: false,
  // namespaceName: "/admin",
});


httpServer.listen(config.port, config.host);


const channels = {};
const sockets = {};
const peers = {};

const options = { depth: null, colors: true };

const signallingServer = (socket) => {
  const clientAddress = socket.handshake.address;

  socket.channels = {};
  sockets[socket.id] = socket;

  console.log("[" + socket.id + "] connection accepted");
  socket.on("disconnect", () => {
    for (const channel in socket.channels) {
      part(channel);
    }
    console.log("[" + socket.id + "] disconnected");
    delete sockets[socket.id];
  });

  socket.on("join", (config) => {
    console.log("[" + socket.id + "] join ", config);
    const channel = clientAddress + config.channel;

    // Already Joined
    if (channel in socket.channels) return;

    if (!(channel in channels)) {
      channels[channel] = {};
    }

    if (!(channel in peers)) {
      peers[channel] = {};
    }

    peers[channel][socket.id] = {
      userData: config.userData,
    };

    console.log("[" + socket.id + "] join - connected peers grouped by channel", util.inspect(peers, options));

    for (const id in channels[channel]) {
      channels[channel][id].emit("addPeer", {
        peer_id: socket.id,
        should_create_offer: false,
        channel: peers[channel],
      });
      socket.emit("addPeer", { peer_id: id, should_create_offer: true, channel: peers[channel] });
    }

    channels[channel][socket.id] = socket;
    socket.channels[channel] = channel;
  });

  socket.on("updateUserData", async (config) => {
    const channel = clientAddress + config.channel;
    const key = config.key;
    const value = config.value;
    for (let id in peers[channel]) {
      if (id == socket.id) {
        peers[channel][id]["userData"][key] = value;
      }
    }
    console.log("[" + socket.id + "] updateUserData", util.inspect(peers[channel][socket.id], options));
  });

  const part = (channel) => {
    // Socket not in channel
    if (!(channel in socket.channels)) return;

    delete socket.channels[channel];
    delete channels[channel][socket.id];

    delete peers[channel][socket.id];
    if (Object.keys(peers[channel]).length == 0) {
      // last peer disconnected from the channel
      delete peers[channel];
    }
    console.log("[" + socket.id + "] part - connected peers grouped by channel", util.inspect(peers, options));

    for (const id in channels[channel]) {
      channels[channel][id].emit("removePeer", { peer_id: socket.id });
      socket.emit("removePeer", { peer_id: id });
    }
  };

  socket.on("relayICECandidate", (config) => {
    let peer_id = config.peer_id;
    let ice_candidate = config.ice_candidate;

    if (peer_id in sockets) {
      sockets[peer_id].emit("iceCandidate", { peer_id: socket.id, ice_candidate: ice_candidate });
    }
  });

  socket.on("relaySessionDescription", (config) => {
    let peer_id = config.peer_id;
    let session_description = config.session_description;

    if (peer_id in sockets) {
      sockets[peer_id].emit("sessionDescription", {
        peer_id: socket.id,
        session_description: session_description,
      });
    }
  });
};
io.of('signalling').on("connection", signallingServer);
