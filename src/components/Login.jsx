/** @jsxRuntime automatic */
/** @jsxImportSource hono/jsx */
import { Layout } from './Layout.jsx';

export const Login = ({ error = false }) => (
    <Layout title="登录 | Sublink Worker">
        <main class="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 px-4">
            <form method="post" action="/login" class="w-full max-w-md bg-white dark:bg-gray-800 p-8 rounded-2xl shadow-lg border border-gray-200 dark:border-gray-700">
                <h1 class="text-2xl font-bold text-gray-900 dark:text-white text-center">Sublink Worker</h1>
                <p class="mt-2 mb-6 text-center text-gray-600 dark:text-gray-400">请登录后管理订阅转换</p>
                {error && <p class="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">账号或密码不正确</p>}
                <label class="block mb-4 text-sm font-medium text-gray-700 dark:text-gray-300">账号<input name="username" required autocomplete="username" class="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900" /></label>
                <label class="block mb-6 text-sm font-medium text-gray-700 dark:text-gray-300">密码<input name="password" type="password" required autocomplete="current-password" class="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900" /></label>
                <button class="w-full rounded-lg bg-primary-600 py-2.5 font-semibold text-white hover:bg-primary-700">登录</button>
            </form>
        </main>
    </Layout>
);
