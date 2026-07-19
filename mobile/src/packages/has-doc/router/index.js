import { createRouter, createWebHashHistory } from 'vue-router'
import HomeView from '../views/HomeView.vue'

const routes = [
  {
    path: '/',
    name: 'Home',
    component: HomeView,
    meta: { title: '组件库' }
  },
  {
    path: '/demo/button',
    name: 'ButtonDemo',
    component: () => import('../views/demos/ButtonDemo.vue'),
    meta: { title: 'BaseButton 按钮' }
  },
  {
    path: '/demo/empty',
    name: 'EmptyDemo',
    component: () => import('../views/demos/EmptyDemo.vue'),
    meta: { title: 'BaseEmpty 空状态' }
  },
  {
    path: '/demo/loading',
    name: 'LoadingDemo',
    component: () => import('../views/demos/LoadingDemo.vue'),
    meta: { title: 'BaseLoading 加载' }
  },
  {
    path: '/demo/modal',
    name: 'ModalDemo',
    component: () => import('../views/demos/ModalDemo.vue'),
    meta: { title: 'BaseModal 弹窗' }
  },
  {
    path: '/demo/tag',
    name: 'TagDemo',
    component: () => import('../views/demos/TagDemo.vue'),
    meta: { title: 'BaseTag 标签' }
  },
  {
    path: '/demo/image',
    name: 'ImageDemo',
    component: () => import('../views/demos/ImageDemo.vue'),
    meta: { title: 'BaseImage 图片' }
  },
  {
    path: '/demo/card',
    name: 'CardDemo',
    component: () => import('../views/demos/CardDemo.vue'),
    meta: { title: 'BaseCard 卡片' }
  },
  {
    path: '/demo/scroll',
    name: 'ScrollDemo',
    component: () => import('../views/demos/ScrollDemo.vue'),
    meta: { title: 'BaseScroll 滚动' }
  },
  {
    path: '/demo/self-form',
    name: 'SelfFormDemo',
    component: () => import('../views/demos/SelfFormDemo.vue'),
    meta: { title: 'SelfForm 表单' }
  },
  {
    path: '/demo/drawer',
    name: 'DrawerDemo',
    component: () => import('../views/demos/DrawerDemo.vue'),
    meta: { title: 'SelfDrawer 抽屉' }
  },
  {
    path: '/demo/swiper',
    name: 'SwiperDemo',
    component: () => import('../views/demos/SwiperDemo.vue'),
    meta: { title: 'BaseSwiper 轮播' }
  },
  {
    path: '/demo/tabs',
    name: 'TabsDemo',
    component: () => import('../views/demos/TabsDemo.vue'),
    meta: { title: 'BaseTabs 标签页' }
  }
]

const router = createRouter({
  // MPA 每个包独立部署，使用 hash 模式避免不同入口之间的 base 路径问题
  history: createWebHashHistory(),
  routes,
  scrollBehavior() {
    return { top: 0 }
  }
})

router.beforeEach((to, from, next) => {
  document.title = to.meta.title || 'H5 Base Framework'
  next()
})

export default router
