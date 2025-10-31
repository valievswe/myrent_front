import { createRouter, createWebHistory } from 'vue-router'
import Home from '@/views/HomeView.vue'
import SaleTypesView from '@/views/SaleTypesView.vue'
import SectionsView from '@/views/SectionsView.vue'
import OwnersView from '@/views/OwnersView.vue'

const routes = [
  { path: '/', redirect: '/dashboard' },
  {
    meta: { title: "Ommaviy to'lov", public: true },
    path: '/pay',
    name: 'public-pay',
    component: () => import('@/views/PublicPayView.vue'),
  },
  {
    meta: { title: 'Boshqaruv paneli' },
    path: '/dashboard',
    name: 'dashboard',
    component: Home,
  },
  { meta: { title: 'Sotuv turlari' }, path: '/sale-types', name: 'sale-types', component: SaleTypesView },
  { meta: { title: "Bo'limlar" }, path: '/sections', name: 'sections', component: SectionsView },
  {
    meta: { title: 'Tadbirkorlar' },
    path: '/owners',
    name: 'owners',
    component: OwnersView,
  },
  {
    meta: { title: "Do'konlar" },
    path: '/stores',
    name: 'stores',
    component: () => import('@/views/StoresView.vue'),
  },
  {
    meta: { title: 'Rastalar' },
    path: '/stalls',
    name: 'stalls',
    component: () => import('@/views/StallsView.vue'),
  },
  {
    meta: { title: 'Shartnomalar' },
    path: '/contracts',
    name: 'contracts',
    component: () => import('@/views/ContractsView.vue'),
  },
  { meta: { title: 'Raqamli xarita' }, path: '/map', name: 'map', component: () => import('@/views/MapView.vue') },
  { meta: { title: 'Statistika' }, path: '/statistics', name: 'statistics', component: () => import('@/views/StatisticsView.vue') },
  {
    meta: { title: "Attendances" },
    path: '/attendances',
    name: 'attendances',
    component: () => import('@/views/AttendancesView.vue'),
  },
  {
    meta: { title: 'Tranzaksiyalar' },
    path: '/transactions',
    name: 'transactions',
    component: () => import('@/views/TransactionsView.vue'),
  },
  {
    meta: { title: 'Foydalanuvchilar' },
    path: '/users',
    name: 'users',
    component: () => import('@/views/UsersView.vue'),
  },
  {
    meta: { title: 'Kirish' },
    path: '/login',
    name: 'login',
    component: () => import('@/views/LoginView.vue'),
  },
]

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
  scrollBehavior(to, from, savedPosition) {
    return savedPosition || { top: 0 }
  },
})

export default router
