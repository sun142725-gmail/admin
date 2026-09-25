import { createApp } from 'vue'
import { createPinia } from 'pinia'
import GlobalComponents from '@shared/components'
import App from './App.vue'
import router from './router'
import './styles/index.css'
import 'amfe-flexible'

const app = createApp(App)

app.use(createPinia())
app.use(router)
app.use(GlobalComponents)

app.mount('#app')
