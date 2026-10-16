#ifndef NETSCOPE_NATIVE_BRIDGE_H
#define NETSCOPE_NATIVE_BRIDGE_H

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <stdint.h>

#include "quickjs.h"
#include "quickjs-libc.h"

JSValue netscope_js_undefined(void);
JSValue netscope_js_null(void);
JSValue netscope_js_true(void);
JSValue netscope_js_false(void);
int netscope_js_is_exception(JSValue v);
void netscope_js_free_value(JSContext *ctx, JSValue v);

#endif /* NETSCOPE_NATIVE_BRIDGE_H */
