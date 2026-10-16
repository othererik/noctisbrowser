#include "bridge.h"

JSValue netscope_js_undefined(void) {
    return JS_UNDEFINED;
}

JSValue netscope_js_null(void) {
    return JS_NULL;
}

JSValue netscope_js_true(void) {
    return JS_TRUE;
}

JSValue netscope_js_false(void) {
    return JS_FALSE;
}

int netscope_js_is_exception(JSValue v) {
    return JS_IsException(v);
}

void netscope_js_free_value(JSContext *ctx, JSValue v) {
    JS_FreeValue(ctx, v);
}
