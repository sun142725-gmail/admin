import { createApp } from 'vue'
import App from './App.vue'
import router from './router'
import { createPinia } from 'pinia'
import GlobalComponents from '@shared/components'
import 'amfe-flexible'
import './styles/index.css'

const app = createApp(App)

app.use(createPinia())
app.use(router)
app.use(GlobalComponents)

app.mount('#app')
