import { createApp } from 'vue'
import App from './App.vue'
import router from './router'
import { createPinia } from 'pinia'
import i18n from '@c/locales'
import GlobalComponents from '@c/components'
import 'amfe-flexible'
import './styles/index.css'

const app = createApp(App)

app.use(createPinia())
app.use(router)
app.use(i18n)
app.use(GlobalComponents)

app.mount('#app')
