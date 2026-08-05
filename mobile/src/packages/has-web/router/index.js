import { createRouter, createWebHashHistory } from 'vue-router'
import { useAuthStore } from '../stores/auth'
import { useFamilyStore } from '../stores/family'

const routes = [
  {
    path: '/',
    redirect: '/home'
  },
  {
    path: '/login',
    name: 'Login',
    component: () => import('../views/LoginView.vue'),
    meta: { title: '登录', guest: true }
  },
  {
    path: '/register',
    name: 'Register',
    component: () => import('../views/RegisterView.vue'),
    meta: { title: '注册', guest: true }
  },
  {
    path: '/reset-password',
    name: 'ResetPassword',
    component: () => import('../views/ResetPasswordView.vue'),
    meta: { title: '重置密码', guest: true }
  },
  {
    path: '/family-guide',
    name: 'FamilyGuide',
    component: () => import('../views/FamilyGuideView.vue'),
    meta: { title: '家庭引导', requiresAuth: true, skipFamilyCheck: true }
  },
  {
    path: '/home',
    name: 'Home',
    component: () => import('../views/HomeView.vue'),
    meta: { title: '首页', requiresAuth: true, tabbar: true }
  },
  {
    path: '/members',
    name: 'Members',
    component: () => import('../views/MembersView.vue'),
    meta: { title: '成员管理', requiresAuth: true }
  },
  {
    path: '/todos',
    name: 'Todos',
    component: () => import('../views/TodosView.vue'),
    meta: { title: '家务待办', requiresAuth: true, tabbar: true }
  },
  {
    path: '/todos/:id',
    name: 'TodoDetail',
    component: () => import('../views/TodoDetailView.vue'),
    meta: { title: '待办详情', requiresAuth: true }
  },
  {
    path: '/notices',
    name: 'Notices',
    component: () => import('../views/NoticesView.vue'),
    meta: { title: '家庭公告', requiresAuth: true, tabbar: true }
  },
  {
    path: '/notices/edit',
    name: 'NoticeEdit',
    component: () => import('../views/NoticeEditView.vue'),
    meta: { title: '发布公告', requiresAuth: true }
  },
  {
    path: '/profile',
    name: 'Profile',
    component: () => import('../views/ProfileView.vue'),
    meta: { title: '我的', requiresAuth: true, tabbar: true }
  },
  {
    path: '/settings',
    name: 'Settings',
    component: () => import('../views/SettingsView.vue'),
    meta: { title: '设置', requiresAuth: true }
  }
]

const router = createRouter({
  history: createWebHashHistory(),
  routes,
  scrollBehavior() {
    return { top: 0 }
  }
})

router.beforeEach(async (to) => {
  document.title = to.meta.title || 'HAS Web'
  const authStore = useAuthStore()

  // 需要登录但未登录
  if (to.meta.requiresAuth && !authStore.isLoggedIn) {
    return { path: '/login', query: { redirect: to.fullPath } }
  }

  // 已登录访问 guest 页面
  if (to.meta.guest && authStore.isLoggedIn) {
    return { path: '/home' }
  }

  // 需要登录且不是引导页，检查是否有家庭
  if (to.meta.requiresAuth && !to.meta.skipFamilyCheck && authStore.isLoggedIn) {
    const familyStore = useFamilyStore()
    if (!familyStore.hasFamily) {
      // 尝试加载家庭列表
      if (familyStore.families.length === 0) {
        try {
          await familyStore.loadFamilies()
        } catch {
          // 加载失败不阻塞
        }
      }
      if (!familyStore.hasFamily) {
        return { path: '/family-guide' }
      }
    }
  }

  return true
})

export default router
