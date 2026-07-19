import { createApp } from 'vue'
import { createPinia } from 'pinia'
import i18n from '@c/locales'
import GlobalComponents from '@c/components'
import App from './App.vue'
import router from './router'
import './styles/index.css'
import 'amfe-flexible'

const app = createApp(App)

app.use(createPinia())
app.use(router)
app.use(i18n)
app.use(GlobalComponents)

app.mount('#app')
