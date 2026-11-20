/** @jsxRuntime automatic */
/** @jsxImportSource hono/jsx */
import { APP_NAME } from '../constants.js';

const actionClass = 'inline-flex h-11 min-w-11 items-center justify-center whitespace-nowrap rounded-lg px-2.5 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary-500 dark:text-gray-300 dark:hover:bg-gray-800 dark:hover:text-white';

export const Navbar = () => {
    return (
        <nav class="fixed inset-x-0 top-0 z-50 border-b border-gray-200/80 bg-white/90 backdrop-blur-md dark:border-gray-700/60 dark:bg-gray-900/90">
            <div class="mx-auto max-w-4xl px-4 sm:px-6">
                <div class="flex h-16 items-center justify-between gap-2">
                    <a href="#" class="flex shrink-0 items-center gap-1.5 whitespace-nowrap text-sm font-bold tracking-tight text-gray-900 transition-colors hover:text-primary-600 dark:text-white dark:hover:text-primary-400 sm:gap-2 sm:text-lg">
                        <img src="/favicon.ico" alt="" class="h-5 w-5 shrink-0 rounded-md sm:h-6 sm:w-6" />
                        <span>{APP_NAME}</span>
                    </a>
                    <div class="flex shrink-0 items-center gap-1">
                        <form method="post" action="/logout">
                            <button class={actionClass} type="submit">退出</button>
                        </form>
                        <button
                            type="button"
                            class={actionClass}
                            x-on:click="toggleDarkMode()"
                            aria-label="Toggle dark mode"
                        >
                            <i class="fas text-sm" x-bind:class="darkMode ? 'fa-sun' : 'fa-moon'" aria-hidden="true"></i>
                        </button>
                    </div>
                </div>
            </div>
        </nav>
    );
};
