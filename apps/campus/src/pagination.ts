let load: (() => Promise<void>) | null = null;
let loading = false;
export function registerPagination(callback: (() => Promise<void>) | null) {
    load = callback;
    return () => {
        if (load === callback)
            load = null;
    };
}
export async function nextPage() {
    if (!load || loading)
        return;
    loading = true;
    try {
        await load();
    }
    finally {
        loading = false;
    }
}
