import Vue from 'vue'
import App from './App'
import router from './router'

import cookie from 'js-cookie'
import axios from './js/axios'
import { Button } from 'view-design'

import './style/main.less'
import './style/test.scss'
import './style/styles.css'

Vue.prototype.$Cookie = cookie;
Vue.prototype.$Axios = axios;

Vue.component("Button", Button);


import {
  Loading,
  MessageBox,
  Message,
  Notification
} from "element-ui"
Vue.use(Loading.directive);
Vue.prototype.$loading = Loading.service;
Vue.prototype.$msgbox = MessageBox;
Vue.prototype.$alert = MessageBox.alert;
Vue.prototype.$confirm = MessageBox.confirm;
Vue.prototype.$prompt = MessageBox.prompt;
Vue.prototype.$notify = Notification;
Vue.prototype.$message = Message;

Vue.config.productionTip = false

new Vue({
  router,
  // store,
  render: h => h(App)
}).$mount('#app');
