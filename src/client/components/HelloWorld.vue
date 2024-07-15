<template>
  <div id="appWrap" v-bind:style="'display:block;'">
    <section id="blanket"></section>
    <div style="display: flex;">
      <section id="videos" style="display: flex;flex-direction: column;justify-content: flex-start;"></section>
      <div id="formContainer" style="height: 100vh;overflow: scroll;"></div>
    </div>

    <div id="intro" v-if="!callInitiated && !showChat && !showSettings">
      <h1>在线问诊</h1>
      <p>基于webrtc的在线问诊会议系统</p>
      <div style="display: flex;align-items: center;justify-content: space-around;">
        <label for="roomId">房间号：</label>
        <input type="text" id="roomId" v-model="roomId" placeholder="请输入房间号" />
      </div>
      <br />
      <div style="display: flex;align-items: center;justify-content: space-around;">
        <label for="yourName">昵 称：</label>
        <input type="text" id="yourName" v-model="name" v-on:keyup="updateName" placeholder="请输入昵 称" />
      </div>

      <br />

      <div style="display: flex;align-items: center;justify-content: center;" class="footer">
        <button @click="initiateCall">进入问诊</button>
      </div>
    </div>

    <div id="chatWrap" v-if="showChat">
      <div id="chats" ref="chatContainer">
        <div class="chat" v-for="(chat, i) in chats" v-bind:key="i">
          <span class="name">{{ chat.name }}</span>
          <span class="date light"> &middot; {{ formatDate(chat.date) }}</span>
          <div class="message" v-html="linkify(chat.message)"></div>
        </div>
        <div id="noChat" class="light" v-if="!chats.length"><small>暂无聊天消息</small></div>
      </div>
      <div id="composeBox">
        <div id="placeholder" v-if="typing.length <= 0">输入中...</div>
        <div id="compose" contenteditable="true" v-on:keydown.enter="sendChat" v-on:input="edit($event)"
          v-on:paste="paste($event)"></div>
      </div>
      <small class="light">请按 enter 发送</small>
    </div>

    <div id="settings" v-if="showSettings">
      <div id="name" class="label">
        <span>Name:</span>
        <input type="text" placeholder="Enter your name" v-model="name" v-on:keyup="updateNameAndPublish" />
      </div>
      <hr class="separator" />

      <div class="label">Camera 📹</div>
      <div v-for="(videoDevice, i) in videoDevices" v-bind:key="videoDevice.deviceId">
        <div v-bind:class="'link indent ' + (selectedVideoDeviceId === videoDevice.deviceId ? 'active' : '')"
          v-on:click="changeCamera(videoDevice.deviceId)">
          {{ videoDevice.label }}
        </div>
      </div>
      <hr class="separator" />

      <div class="label">Microphone 🎙️</div>
      <div v-for="(audioDevice, i) in audioDevices" v-bind:key="audioDevice.deviceId">
        <div v-bind:class="'link indent ' + (selectedAudioDeviceId === audioDevice.deviceId ? 'active' : '')"
          v-on:click="changeMicrophone(audioDevice.deviceId)">
          {{ audioDevice.label }}
        </div>
      </div>
      <hr class="separator" />

      <div class="link" v-on:click="copyURL">{{ copyText || "复制房间链接" }}</div>
      <hr class="separator" />
      <div class="link" v-on:click="toggleSelfVideoMirror">
        Mirror / Unmirror
        <small class="light">(self-view)</small>
      </div>
    </div>


    <!-- 操作栏 -->
    <div id="actionsWrap" v-if="callInitiated">
      <div id="actions">
        <button v-bind:class="'icon-mic' + (audioEnabled ? '' : '-off')" v-on:click="audioToggle"></button>
        <button v-bind:class="'icon-video' + (videoEnabled ? '' : '-off')" v-on:click="videoToggle"></button>
        <button v-bind:class="'icon-message-square ' + (showChat ? 'active' : '')"
          v-on:click="showChat = !showChat"></button>
        <button v-if="!isMobileDevice" v-bind:class="'icon-monitor ' + (screenShareEnabled ? 'active' : '')"
          v-on:click="screenShareToggle"></button>
        <button v-bind:class="'icon-file-text'" v-on:click="fileUpload">
        </button>
        <input style="display: none;" type="file" id="fileInput" @change="handleFileUpload">
        <button v-bind:class="'icon-file-plus'" v-on:click="exportJSON"></button>

        <button v-bind:class="'icon-exit'" v-on:click="exit"></button>
        <button v-bind:class="'icon-more-horizontal ' + (showSettings ? 'active' : '')"
          v-on:click="showSettings = !showSettings"></button>
      </div>
    </div>
  </div>
</template>

<script>
import { io } from "socket.io-client";
const config = {
  SIGNALLING_SERVER: "http://localhost:3200/signalling",
  ICE_SERVERS: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
    { urls: "stun:23.21.150.121" },
    { urls: "stun:stun01.sipphone.com" },
    { urls: "stun:stun.ekiga.net" },
    { urls: "stun:stun.fwdnet.net" },
    { urls: "stun:stun.ideasip.com" },
    { urls: "stun:stun.iptel.org" },
    {
      "username": "dc2d2894d5a9023620c467b0e71cfa6a35457e6679785ed6ae9856fe5bdfa269",
      "credential": "tE2DajzSJwnsSbc123",
      "urls": "turn:global.turn.twilio.com:3478?transport=udp"
    },
    {
      "username": "dc2d2894d5a9023620c467b0e71cfa6a35457e6679785ed6ae9856fe5bdfa269",
      "credential": "tE2DajzSJwnsSbc123",
      "urls": "turn:global.turn.twilio.com:3478?transport=tcp"
    },
    {
      "username": "dc2d2894d5a9023620c467b0e71cfa6a35457e6679785ed6ae9856fe5bdfa269",
      "credential": "tE2DajzSJwnsSbc123",
      "urls": "turn:global.turn.twilio.com:443?transport=tcp"
    }
  ],
  USE_AUDIO: true,
  USE_VIDEO: true,
}
const { ICE_SERVERS, USE_AUDIO, USE_VIDEO, SIGNALLING_SERVER } = config

const APP_URL = (() => {
  const protocol = "http" + (location.hostname == "localhost" ? "" : "s") + "://";
  return protocol + location.hostname + (location.hostname == "localhost" ? ":" + location.port : "");
})();

let signalingSocket = null; // 信令handle
let localMediaStream = null; /* our own microphone / webcam */
let peers = {}; /* keep track of our peer connections, indexed by peer_id (aka socket.io id) */
let channel = {}; /* keep track of the peers Info in the channel, indexed by peer_id (aka socket.io id) */
let peerMediaElements = {}; /* keep track of our <video>/<audio> tags, indexed by peer_id */
let dataChannels = {};


const attachMediaStream = (element, stream) => (element.srcObject = stream);

const resizeVideos = () => {
  const numToString = ["", "one", "two", "three", "four", "five", "six"];
  const videos = document.querySelectorAll("#videos .video");
  document.querySelectorAll("#videos .video").forEach((v) => {
    v.className = "video " + numToString[videos.length];
  });
};

const calcViewPortUnit = () => {
  let vh = document.getElementById("blanket").offsetHeight * 0.01;
  document.documentElement.style.setProperty("--vh", `${vh}px`);
};
function joinChatChannel(channel, userData) {
  signalingSocket.emit("join", { channel, userData });
}
export default {
  name: 'HelloWorld',
  components: {
  },
  data() {
    return {
      peerId: "",
      roomId: "",
      roomLink: "",
      copyText: "",
      userAgent: "",
      isMobileDevice: false,
      isTablet: false,
      isIpad: false,
      isDesktop: false,
      videoDevices: [],
      audioDevices: [],
      audioEnabled: true,
      videoEnabled: true,
      screenShareEnabled: false,
      showChat: false,
      showSettings: false,
      hideToolbar: true,
      selectedAudioDeviceId: "",
      selectedVideoDeviceId: "",
      name: window.localStorage.name,
      typing: "",
      chats: [],
      callInitiated: false,
    };
  },
  mounted() {
    const searchParams = new URLSearchParams(window.location.search);
    let roomId = searchParams.get("room");

    if (!roomId) {
      roomId = Math.random().toString(36).substr(2, 6);
      searchParams.set("room", roomId);
      window.location.search = searchParams.toString();
    }
    this.roomId = roomId

    const clickHandle = () => {
      if (!this.showChat && !this.showSettings) {
        this.hideToolbar = !this.hideToolbar;
      }
      if (this.showSettings && this.showChat) {
        this.showChat = !this.showChat;
        this.showSettings = !this.showSettings;
      }
    }
    window.addEventListener("resize", calcViewPortUnit);
    window.addEventListener("load", calcViewPortUnit);
    document.addEventListener("click", clickHandle);

    this.$once('hook:beforeDestroy', function () {
      window.removeEventListener("resize", calcViewPortUnit)
      window.removeEventListener("load", calcViewPortUnit)
      document.removeEventListener("click", clickHandle);
    })
  },
  methods: {
    getVideoElement(peerId, isLocal) {
      const videoWrap = document.createElement("div");
      videoWrap.className = "video";

      const media = document.createElement("video");
      media.setAttribute("playsinline", true);
      media.autoplay = true;
      media.controls = false;
      if (isLocal) {
        media.setAttribute("id", "selfVideo");
        media.className = "mirror";
        media.muted = true;
        media.volume = 0;
      } else {
        media.mediaGroup = "remotevideo";
      }

      const audioEnabled = document.createElement("i");
      audioEnabled.setAttribute("id", peerId + "_audioEnabled");
      audioEnabled.className = "audioEnabled icon-mic";

      const peerNameEle = document.createElement("div");
      peerNameEle.setAttribute("id", peerId + "_videoPeerName");
      peerNameEle.className = "videoPeerName";
      if (isLocal) {
        peerNameEle.innerHTML = `${this.name ?? ""} (you)`;
      } else {
        peerNameEle.innerHTML = "Unnamed";
      }

      const fullScreenBtn = document.createElement("button");
      fullScreenBtn.className = "icon-maximize";
      fullScreenBtn.addEventListener("click", () => {
        if (videoWrap.requestFullscreen) {
          videoWrap.requestFullscreen();
        } else if (videoWrap.webkitRequestFullscreen) {
          videoWrap.webkitRequestFullscreen();
        }
      });

      const videoAvatarImgSize = this.isMobileDevice ? "100px" : "200px";
      const videoAvatarImg = document.createElement("img");
      videoAvatarImg.setAttribute("id", peerId + "_videoEnabled");
      videoAvatarImg.setAttribute("src", "videoOff.png");
      videoAvatarImg.setAttribute("width", videoAvatarImgSize);
      videoAvatarImg.setAttribute("height", videoAvatarImgSize);
      videoAvatarImg.className = "videoAvatarImg";

      videoWrap.setAttribute("id", peerId);
      videoWrap.appendChild(media);
      videoWrap.appendChild(audioEnabled);
      videoWrap.appendChild(peerNameEle);
      videoWrap.appendChild(fullScreenBtn);
      videoWrap.appendChild(videoAvatarImg);
      document.getElementById("videos").appendChild(videoWrap);
      return media;
    },
    setupLocalMedia(callback, errorback) {
      if (localMediaStream != null) {
        if (callback) callback();
        return;
      }

      navigator.mediaDevices
        .getUserMedia({ audio: USE_AUDIO, video: USE_VIDEO })
        .then((stream) => {
          localMediaStream = stream;
          const localMedia = this.getVideoElement(this.peerId, true);
          attachMediaStream(localMedia, stream);
          resizeVideos();
          if (callback) callback();

          navigator.mediaDevices.enumerateDevices().then((devices) => {
            console.log(devices, 'devicesƒ');
            this.videoDevices = devices.filter((device) => device.kind === "videoinput" && device.deviceId !== "default");
            this.audioDevices = devices.filter((device) => device.kind === "audioinput" && device.deviceId !== "default");
          });
        })
        .catch((e) => {
          /* user denied access to a/v */
          console.log(e);
          alert("This site will not work without camera/microphone access.");
          if (errorback) errorback();
        });
    },
    windowInitiateCall() {
      this.userAgent = navigator.userAgent;
      this.isMobileDevice = !!/Android|webOS|iPhone|iPad|iPod|BB10|BlackBerry|IEMobile|Opera Mini|Mobile|mobile/i.test(
        this.userAgent.toUpperCase() || ""
      );
      this.isTablet =
        /(ipad|tablet|(android(?!.*mobile))|(windows(?!.*phone)(.*touch))|kindle|playbook|silk|(puffin(?!.*(IP|AP|WP))))/.test(
          this.userAgent.toLowerCase()
        );
      this.isIpad = /macintosh/.test(this.userAgent.toLowerCase()) && "ontouchend" in document;
      this.isDesktop = !this.isMobileDevice && !this.isTablet && !this.isIpad;

      this.roomLink = `${APP_URL}/?room=${this.roomId}`;

      // 连接信令服务
      signalingSocket = io(SIGNALLING_SERVER);
      signalingSocket.on("connect", () => {
        this.peerId = signalingSocket.id;
        console.log("peerId: " + this.peerId);

        const userData = {
          peerName: this.name,
          videoEnabled: this.videoEnabled,
          audioEnabled: this.audioEnabled,
          userAgent: this.userAgent,
          isMobileDevice: this.isMobileDevice,
          isTablet: this.isTablet,
          isIpad: this.isIpad,
          isDesktop: this.isDesktop,
        };

        // 本地流
        if (localMediaStream) joinChatChannel(this.roomId, userData);
        else
          this.setupLocalMedia(() => {
            joinChatChannel(this.roomId, userData);
          });
      });

      // 断开连接
      signalingSocket.on("disconnect", () => {
        for (let peer_id in peerMediaElements) {
          document.getElementById("videos").removeChild(peerMediaElements[peer_id].parentNode);
          resizeVideos();
        }
        for (let peer_id in peers) {
          peers[peer_id].close();
        }

        peers = {};
        peerMediaElements = {};
      });

      // 用户加入
      signalingSocket.on("addPeer", (config) => {
        console.log("addPeer", config);
        const peer_id = config.peer_id;
        if (peer_id in peers) return;

        channel = config.channel;
        const peerConnection = new RTCPeerConnection({ iceServers: ICE_SERVERS });
        peers[peer_id] = peerConnection;

        peerConnection.onicecandidate = (event) => {
          console.log("onicecandidate");
          if (event.candidate) {
            signalingSocket.emit("relayICECandidate", {
              peer_id: peer_id,
              ice_candidate: {
                sdpMLineIndex: event.candidate.sdpMLineIndex,
                candidate: event.candidate.candidate,
              },
            });
          }
        };

        peerConnection.onaddstream = (event) => {
          console.log("onaddstream");
          if (!channel[peer_id]["userData"]["userAgent"]) return;

          const remoteMedia = this.getVideoElement(peer_id);
          peerMediaElements[peer_id] = remoteMedia;
          attachMediaStream(remoteMedia, event.stream);
          resizeVideos();

          for (let peerId in channel) {
            const videoPeerName = document.getElementById(peerId + "_videoPeerName");
            const peerName = channel[peerId]["userData"]["peerName"];
            if (videoPeerName && peerName) {
              videoPeerName.innerHTML = peerName;
            }

            const videoAvatarImg = document.getElementById(peerId + "_videoEnabled");
            const videoEnabled = channel[peerId]["userData"]["videoEnabled"];
            if (videoAvatarImg && !videoEnabled) {
              videoAvatarImg.style.visibility = "visible";
            }

            const audioEnabledEl = document.getElementById(peerId + "_audioEnabled");
            const audioEnabled = channel[peerId]["userData"]["audioEnabled"];
            if (audioEnabledEl) {
              audioEnabledEl.className = "audioEnabled icon-mic" + (audioEnabled ? "" : "-off");
            }
          }
        };

        peerConnection.ondatachannel = (event) => {
          console.log("Datachannel event" + peer_id, event);
          event.channel.onmessage = (msg) => {
            let dataMessage = {};
            try {
              dataMessage = JSON.parse(msg.data);
              this.handleIncomingDataChannelMessage(dataMessage);
            } catch (err) {
              console.log(err);
            }
          };
        };

        // 添加本地流
        peerConnection.addStream(localMediaStream);
        dataChannels[peer_id] = peerConnection.createDataChannel("talk__data_channel");

        if (config.should_create_offer) {
          peerConnection.onnegotiationneeded = () => {
            peerConnection
              .createOffer()
              .then((localDescription) => {
                peerConnection
                  .setLocalDescription(localDescription)
                  .then(() => {
                    signalingSocket.emit("relaySessionDescription", {
                      peer_id: peer_id,
                      session_description: localDescription,
                    });
                  })
                  .catch(() => {
                    alert("Offer setLocalDescription failed!");
                  });
              })
              .catch((error) => {
                console.log("Error sending offer: ", error);
              });
          };
        }
      });

      // 接收到含有 SDP 的 offer 。 存储对端的 SDP 信息，创建及设置本地的 SDP 信息,并通过信令服务器传送含有本地 SDP 信息的 answer
      signalingSocket.on("sessionDescription", (config) => {
        const peer_id = config.peer_id;
        const peer = peers[peer_id];
        const remoteDescription = config.session_description;

        const desc = new RTCSessionDescription(remoteDescription);
        peer.setRemoteDescription(
          desc,
          () => {
            if (remoteDescription.type == "offer") {
              peer.createAnswer(
                (localDescription) => {
                  peer.setLocalDescription(
                    localDescription,
                    () => {
                      signalingSocket.emit("relaySessionDescription", {
                        peer_id: peer_id,
                        session_description: localDescription,
                      });
                    },
                    () => alert("Answer setLocalDescription failed!")
                  );
                },
                (error) => console.log("Error creating answer: ", error)
              );
            }
          },
          (error) => console.log("setRemoteDescription error: ", error)
        );
      });

      // 添加ice
      signalingSocket.on("iceCandidate", (config) => {
        const peer = peers[config.peer_id];
        const iceCandidate = config.ice_candidate;
        peer.addIceCandidate(new RTCIceCandidate(iceCandidate)).catch((error) => {
          console.log("Error addIceCandidate", error);
        });
      });

      // 成员断开
      signalingSocket.on("removePeer", (config) => {
        const peer_id = config.peer_id;
        if (peer_id in peerMediaElements) {
          document.getElementById("videos").removeChild(peerMediaElements[peer_id].parentNode);
          resizeVideos();
        }
        if (peer_id in peers) {
          peers[peer_id].close();
        }
        delete dataChannels[peer_id];
        delete peers[peer_id];
        delete peerMediaElements[config.peer_id];

        delete channel[config.peer_id];
        //console.log('removePeer', JSON.stringify(channel, null, 2));
      });
    },
    initiateCall() {
      if (!this.roomId)
        return this.$message({
          message: '无效的房间号',
          type: 'warning'
        });

      if (!this.name)
        return this.$message({
          message: '无效的昵称',
          type: 'warning'
        });

      this.callInitiated = true;
      this.windowInitiateCall();
    },
    // 复制url
    copyURL() {
      navigator.clipboard.writeText(this.roomLink).then(
        () => {
          this.copyText = "Copied 👍";
          setTimeout(() => (this.copyText = ""), 3000);
        },
        (err) => console.error(err)
      );
    },
    // 切换音频
    audioToggle(e) {
      e.stopPropagation();
      localMediaStream.getAudioTracks()[0].enabled = !localMediaStream.getAudioTracks()[0].enabled;
      this.audioEnabled = !this.audioEnabled;
      this.updateUserData("audioEnabled", this.audioEnabled);
    },
    // 切换视频
    videoToggle(e) {
      e.stopPropagation();
      localMediaStream.getVideoTracks()[0].enabled = !localMediaStream.getVideoTracks()[0].enabled;
      this.videoEnabled = !this.videoEnabled;
      this.updateUserData("videoEnabled", this.videoEnabled);
    },
    // 显示视频列表
    toggleSelfVideoMirror() {
      document.querySelector("#videos .video #selfVideo").classList.toggle("mirror");
    },
    updateName() {
      window.localStorage.name = this.name;
    },
    updateNameAndPublish() {
      window.localStorage.name = this.name;
      this.updateUserData("peerName", this.name);
    },
    // 屏幕共享
    screenShareToggle(e) {
      e.stopPropagation();
      let screenMediaPromise;
      if (!this.screenShareEnabled) {
        if (navigator.getDisplayMedia) {
          screenMediaPromise = navigator.getDisplayMedia({ video: true });
        } else if (navigator.mediaDevices.getDisplayMedia) {
          screenMediaPromise = navigator.mediaDevices.getDisplayMedia({ video: true });
        } else {
          screenMediaPromise = navigator.mediaDevices.getUserMedia({
            video: { mediaSource: "screen" },
          });
        }
      } else {
        screenMediaPromise = navigator.mediaDevices.getUserMedia({ video: true });
        document.getElementById(this.peerId + "_videoEnabled").style.visibility = "hidden";
      }
      screenMediaPromise
        .then((screenStream) => {
          this.screenShareEnabled = !this.screenShareEnabled;

          this.videoEnabled = true;
          this.updateUserData("videoEnabled", this.videoEnabled);

          for (let peer_id in peers) {
            const sender = peers[peer_id].getSenders().find((s) => (s.track ? s.track.kind === "video" : false));
            sender.replaceTrack(screenStream.getVideoTracks()[0]);
          }
          screenStream.getVideoTracks()[0].enabled = true;
          const newStream = new MediaStream([screenStream.getVideoTracks()[0], localMediaStream.getAudioTracks()[0]]);
          localMediaStream = newStream;
          attachMediaStream(document.getElementById("selfVideo"), newStream);
          this.toggleSelfVideoMirror();

          screenStream.getVideoTracks()[0].onended = function () {
            if (this.screenShareEnabled) this.screenShareToggle();
          };
          try {
            if (cabin) {
              cabin.event("screen-share-" + this.screenShareEnabled);
            }
          } catch (e) { }
        })
        .catch((e) => {
          alert("Unable to share screen. Please use a supported browser.");
          console.error(e);
        });
    },
    // 更新用户信息
    updateUserData(key, value) {
      this.sendDataMessage(key, value);

      switch (key) {
        case "audioEnabled":
          document.getElementById(this.peerId + "_audioEnabled").className =
            "audioEnabled icon-mic" + (value ? "" : "-off");
          break;
        case "videoEnabled":
          document.getElementById(this.peerId + "_videoEnabled").style.visibility = value ? "hidden" : "visible";
          break;
        case "peerName":
          document.getElementById(this.peerId + "_videoPeerName").innerHTML = value + " (you)";
          break;
        default:
          break;
      }
    },
    // 修改摄像头
    changeCamera(deviceId) {
      navigator.mediaDevices
        .getUserMedia({ video: { deviceId: deviceId } })
        .then((camStream) => {
          console.log(camStream);

          this.videoEnabled = true;
          this.updateUserData("videoEnabled", this.videoEnabled);

          for (let peer_id in peers) {
            const sender = peers[peer_id].getSenders().find((s) => (s.track ? s.track.kind === "video" : false));
            sender.replaceTrack(camStream.getVideoTracks()[0]);
          }
          camStream.getVideoTracks()[0].enabled = true;

          const newStream = new MediaStream([camStream.getVideoTracks()[0], localMediaStream.getAudioTracks()[0]]);
          localMediaStream = newStream;
          attachMediaStream(document.getElementById("selfVideo"), newStream);
          this.selectedVideoDeviceId = deviceId;
        })
        .catch((err) => {
          console.log(err);
          alert("Error while swaping camera");
        });
    },
    changeMicrophone(deviceId) {
      navigator.mediaDevices
        .getUserMedia({ audio: { deviceId: deviceId } })
        .then((micStream) => {
          this.audioEnabled = true;
          this.updateUserData("audioEnabled", this.audioEnabled);

          for (let peer_id in peers) {
            const sender = peers[peer_id].getSenders().find((s) => (s.track ? s.track.kind === "audio" : false));
            sender.replaceTrack(micStream.getAudioTracks()[0]);
          }
          micStream.getAudioTracks()[0].enabled = true;

          const newStream = new MediaStream([localMediaStream.getVideoTracks()[0], micStream.getAudioTracks()[0]]);
          localMediaStream = newStream;
          attachMediaStream(document.getElementById("selfVideo"), newStream);
          this.selectedAudioDeviceId = deviceId;
        })
        .catch((err) => {
          console.log(err);
          alert("Error while swaping microphone");
        });
    },
    sanitizeString(str) {
      const tagsToReplace = { "&": "&amp;", "<": "&lt;", ">": "&gt;" };
      const replaceTag = (tag) => tagsToReplace[tag] || tag;
      const safe_tags_replace = (str) => str.replace(/[&<>]/g, replaceTag);
      return safe_tags_replace(str);
    },
    linkify(str) {
      return this.sanitizeString(str).replace(/(?:(?:https?|ftp):\/\/)?[\w/\-?=%.]+\.[\w/\-?=%]+/gi, (match) => {
        let displayURL = match.trim().replace("https://", "").replace("https://", "");
        displayURL = displayURL.length > 25 ? displayURL.substr(0, 25) + "&hellip;" : displayURL;
        const url = !/^https?:\/\//i.test(match) ? "http://" + match : match;
        return `<a href="${url}" target="_blank" class="link" rel="noopener">${displayURL}</a>`;
      });
    },
    edit(e) {
      this.typing = e.srcElement.textContent;
    },
    paste(e) {
      e.preventDefault();
      const clipboardData = e.clipboardData || window.clipboardData;
      const pastedText = clipboardData.getData("Text");
      document.execCommand("inserttext", false, pastedText.replace(/(\r\n\t|\n|\r\t)/gm, " "));
    },
    sendChat(e) {
      e.stopPropagation();
      e.preventDefault();

      if (!this.typing.length) return;

      if (Object.keys(peers).length > 0) {
        const composeElement = document.getElementById("compose");
        this.sendDataMessage("chat", this.typing);
        this.typing = "";
        composeElement.textContent = "";
        composeElement.blur;
      } else {
        alert("No peers in the room");
      }
    },
    // 对每个 webrtc端 发送消息
    sendDataMessage(key, value) {
      const dataMessage = {
        type: key,
        name: this.name,
        id: this.peerId,
        message: value,
        date: new Date().toISOString(),
      };

      switch (key) {
        case "chat":
          this.chats.push(dataMessage);
          this.$nextTick(this.scrollToBottom);
          break;
        default:
          break;
      }

      Object.keys(dataChannels).map((peer_id) => dataChannels[peer_id].send(JSON.stringify(dataMessage)));
    },
    // 消息分发
    handleIncomingDataChannelMessage(dataMessage) {
      switch (dataMessage.type) {
        case "chat":
          this.showChat = true;
          this.hideToolbar = false;
          this.chats.push(dataMessage);
          this.$nextTick(this.scrollToBottom);
          break;
        case "audioEnabled":
          document.getElementById(dataMessage.id + "_audioEnabled").className =
            "audioEnabled icon-mic" + (dataMessage.message ? "" : "-off");
          break;
        case "videoEnabled":
          document.getElementById(dataMessage.id + "_videoEnabled").style.visibility = dataMessage.message
            ? "hidden"
            : "visible";
          break;
        case "peerName":
          document.getElementById(dataMessage.id + "_videoPeerName").innerHTML = dataMessage.message;
          break;
        default:
          break;
      }
    },
    scrollToBottom() {
      const chatContainer = this.$refs.chatContainer;
      chatContainer.scrollTop = chatContainer.scrollHeight;
    },
    formatDate(dateString) {
      const date = new Date(dateString);
      const hours = date.getHours() > 12 ? date.getHours() - 12 : date.getHours();
      return (
        (hours < 10 ? "0" + hours : hours) +
        ":" +
        (date.getMinutes() < 10 ? "0" + date.getMinutes() : date.getMinutes()) +
        " " +
        (date.getHours() >= 12 ? "PM" : "AM")
      );
    },
    setStyle(key, value) {
      document.documentElement.style.setProperty(key, value);
    },
    onCallFeedback(e) {
      try {
        if (cabin) {
          cabin.event(e.target.getAttribute("data-cabin-event"));
        }
      } catch (e) { }
    },
    exit() {
      location.reload();
      // signalingSocket.close();
      // for (let peer_id in peers) {
      //   peers[peer_id].close();
      // }
      // this.callInitiated = false;
    },
    fileUpload() {
      const inputElement = document.getElementById('fileInput');
      inputElement.click();
    },
    handleFileUpload(event) {
      const file = event.target.files[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = function (e) {
          try {
            console.log(e, 'e');
            const jsonData = JSON.parse(e.target.result);
            LForms.Util.addFormToPage(jsonData, 'formContainer');

            // const lformsQ = LForms.Util.convertFHIRQuestionnaireToLForms(jsonData, 'R4');
            // const formWithUserData = LForms.Util.mergeFHIRDataIntoLForms("QuestionnaireResponse", {"resourceType":"QuestionnaireResponse","meta":{"profile":["http://hl7.org/fhir/uv/sdc/StructureDefinition/sdc-questionnaireresponse|2.7"],"tag":[{"code":"lformsVersion: 34.0.0"}]},"status":"completed","authored":"2024-07-13T14:40:19.315Z","item":[{"linkId":"/conditions","text":"Medical Conditions","item":[{"linkId":"/conditions/condition","text":"Medical condition","answer":[{"valueCoding":{"code":"19527","display":"C1 ring fracture"}}]},{"linkId":"/conditions/cond_status","text":"Status","answer":[{"valueCoding":{"code":"A","display":"Active"}}]},{"linkId":"/conditions/cond_started","text":"Started","answer":[{"valueDate":"2024-07-01"}]},{"linkId":"/conditions/cond_stopped","text":"Stopped","answer":[{"valueDate":"2024-07-13"}]},{"linkId":"/conditions/cond_comment","text":"Description/Comment","answer":[{"valueString":"aaa"}]}]}]}, lformsQ, "R4");

            // console.log(formWithUserData, 'formWithUserData');
            // LForms.Util.addFormToPage(formWithUserData, 'formContainer');

          } catch (error) {
            console.error('文件内容不是有效的JSON:', error);
          }
        };
        reader.readAsText(file);
      }
    },
    exportJSON() {
      // this.exportJSON1("DiagnosticReport", 'DiagnosticReport')
      // this.exportJSON1("Questionnaire", 'Questionnaire')
      this.exportJSON1("QuestionnaireResponse", 'QuestionnaireResponse')
    },
    exportJSON1(type, name) {
      const qr = LForms.Util.getFormFHIRData(type, 'R4');
      const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(qr));
      const downloadAnchorNode = document.createElement('a');
      downloadAnchorNode.setAttribute("href", dataStr);
      downloadAnchorNode.setAttribute("download", name + ".json");
      document.body.appendChild(downloadAnchorNode); // required for firefox
      downloadAnchorNode.click();
      downloadAnchorNode.remove();
    }
  },
}
</script>

<!-- Add "scoped" attribute to limit CSS to this component only -->
<style scoped>
h1,
h2 {
  font-weight: normal;
}

ul {
  list-style-type: none;
  padding: 0;
}

li {
  display: inline-block;
  margin: 0 10px;
}

a {
  color: #42b983;
}
</style>
