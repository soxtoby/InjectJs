(function () {
    var maxDependencyDepth = 20;
    var resolveFn = 'inject.resolveFn';
    var scopeFn = 'inject.scope'; // Key for current scope
    var locals = 'inject.locals';
    var _call = variadic(_apply);
    var call_ = variadic(apply_);
    var call = variadic(apply);
    var resolveChain = [];

    window.inject = extend(function inject(registrations, parentResolve) {
        var scope = newScope(),
            resolveInjected = newLookup(registeredKeys(), registeredFactories(), parentResolve && parentResolve.injected);

        return parentResolve
            ? parentResolve(new Registration(constant(extendedResolve()), null))
            : extendedResolve();

        function extendedResolve() {
            return extend(resolve, {
                injected: resolveInjected,
                dispose: scope.dispose,
                function: resolveFunction,
                defaultFactory: defaultFactory
            });
        }

        function resolve(key) {
            if (!key)
                throw new Error("Tried to resolve " + name(key));

            if (resolveChain.length == maxDependencyDepth)
                throw new Error("Maximum dependency depth of " + maxDependencyDepth + " reached" + resolveChainMessage());

            resolveChain.push(key);
            try {
                return verifyType(key, resolveFunction(defaultFactory(key).withLifeTime)());
            } finally {
                resolveChain.pop();
            }
        }

        function resolveFunction(fn, localKeys, localValues) {
            return variadic(function (args) {
                return fn.apply(this, resolveDependencies(dependencyKeys(fn), localKeys || [], localValues || []).concat(args));
            });
        }

        function defaultFactory(key) {
            var injectedFn = resolve.injected(key);

            if (key instanceof Registration)
                return key.build(resolve, scope);
            if (injectedFn)
                return injectedFn;
            if (isFunction(key))
                return inject.type(key).build(resolve, scope);
            throw new Error('Failed to resolve key ' + name(key) + resolveChainMessage());
        }

        function resolveDependencies(required, localKeys, localValues) {
            var localLookup = newLocalLookup(localKeys, localValues);
            return required.map(unary(call_(localLookup, resolve)));
        }

        function registeredKeys() {
            return flatMap(
                    registrations || [],
                    function (r) { return r.keys(); })
                .concat(resolveFn, scopeFn);
        }

        function registeredFactories() {
            return flatMap(
                    registrations || [],
                    function (r) { return repeat(r.build(resolve, scope), r.keys().length); })
                .concat(noLifeTime(constant(resolve)), noLifeTime(constant(scope)));
        }
    }, {
        resolve: resolveFn,

        dependant: dependant,

        ctor: function (dependencies, fn) {
            verifyArity(dependencies, fn);

            return dependant(dependencies, fn);
        },

        fallback: function (fallbackFn, parentResolve) {
            var fallbackResolve = inject();
            parentResolve = parentResolve || { injected: { all: constant([]) } };
            fallbackResolve.injected.all = function (key) {
                var value = fallbackFn(key);
                return parentResolve.injected.all(key)
                    .concat(isDefined(value) ? [noLifeTime(constant(value))] : []);
            };
            return fallbackResolve;
        },

        forType: function (type) {
            verifyIsFunction(type, "Registration type");
            return new Registration().forType(type);
        },

        forTypes: function(types) {
            types.forEach(unary(call_(verifyIsFunction, "Registration type")));
            return new Registration().forTypes(types);
        },

        type: function (type) {
            verifyIsFunction(type, "Registration type");
            return new Registration().create(type);
        },

        forKey: function (key) {
            return new Registration().forKey(key);
        },

        forKeys: function(keys) {
            return new Registration().forKeys(keys);
        },

        single: function (type) {
            return inject.forType(type).create(type).once();
        },

        factory: function (fn) {
            return new Registration(fn);
        },

        value: function (value) {
            return new Registration().use(value);
        },

        function: function (fn) {
            return new Registration().resolveFunction(fn);
        },

        func: function (key, funcDependencies) {
            return new Registration(dependant([resolveFn, scopeFn], function (resolve, scope) {
                return variadic(function (args) {
                    return scope(null, resolve.function(resolve.defaultFactory(key), funcDependencies, args));
                });
            }), null);
        },

        optional: function (key, defaultValue) {
            return new Registration(dependant([resolveFn], function (resolve) {
                var defaultValueFactory = constant(defaultArg(defaultValue, null));
                return resolve.function(
                        resolve.injected(key, constant(defaultValueFactory)))
                    ();
            }), null);
        },

        named: function (type, key) {
            return new Registration(dependant([key], _call(verifyType, type)), null);
        },

        all: function (key) {
            return new Registration(dependant([resolveFn], function (resolve) {
                return resolve.injected.all(key)
                    .map(unary(resolve.function))
                    .map(unary(call))
                    .map(_call(verifyType, key));
            }), null);
        }
    });

    function Registration(factory, key) {
        var self = this,
            _keys = isDefined(key) ? [key] : [],
            _factory,
            _lifeTime,
            _constructor,
            _value,
            _function;

        extend(self, {
            keys: function () {
                return !_keys.length && _constructor
                    ? [_constructor]
                    : _keys;
            },

            forType: chain(function (type) {
                self.forTypes([type]);
            }),

            forTypes: chain(function(types) {
                _keys = _keys.concat(types);
                validate();
            }),

            forKey: chain(function (key) {
                self.forKeys([key]);
            }),

            forKeys: chain(function(keys) {
                if (keys.some(function(key) {return typeof key != 'string';}))
                    throw new Error("Registration key is not a string");

                _keys = _keys.concat(keys);
                validate();
            }),

            create: chain(function (type) {
                _constructor = defaultArg(type, null);
                _factory = constructor(type);

                validate();
            }),

            use: chain(function (value) {
                if (notDefined(value))
                    throw new Error("Value is undefined");

                _value = value;
                _factory = _lifeTime = constant(defaultArg(value, null));

                validate();
            }),

            call: chain(function (fn) {
                _factory = defaultArg(fn, null);
                validate();
            }),

            resolveFunction: chain(function (fn) {
                _function = fn;
                _factory = dependant([resolveFn, locals], function (resolve, local) {
                    return resolve.function(fn, local.keys, local.values);
                });

                validate();
            }),

            once: chain(function () {
                _lifeTime = function (factory, registeredResolve, registeredScope, resolve, currentScope) {
                    return registeredScope(self.keys()[0], registeredResolve.function(factory));
                };
            }),

            perContainer: chain(function () {
                _lifeTime = function (factory, registeredResolve, registeredScope, resolve, currentScope) {
                    return currentScope(self.keys()[0], resolve.function(factory));
                };
            }),

            perDependency: chain(function () {
                _lifeTime = function (factory, registeredResolve, registeredScope, resolve, currentScope) {
                    return currentScope(null, resolve.function(factory));
                };
            }),

            then: chain(function (callback) {
                _factory = dependant(dependencyKeys(_factory),
                    compose(_factory, function (value) {
                        callback(value);
                        return value;
                    }));
            }),

            useParameterHook: chain(function (hook) {
                verifyIsFunction(hook, 'Parameter hook');

                var innerFactory = _factory;
                _factory = dependant([resolveFn, locals], function (resolve, local) {
                    var originalKeys = dependencyKeys(innerFactory);
                    var hookedKeys = originalKeys.map(function (key) {
                        var hookValue = hook(resolve, key);
                        return isDefined(hookValue)
                            ? new Registration(constant(hookValue), null)
                            : key;
                    });

                    return resolve.function(dependant(hookedKeys, _call(innerFactory)), local.keys, local.values)();
                });
            }),

            withDependency: chain(function (key, value) {
                verifyType(key, value);

                self.useParameterHook(function (resolve, paramKey) {
                    if (paramKey === key) return value;
                });
            }),

            withArguments: chain(variadic(function (args) {
                _factory = dependant(
                    dependencyKeys(_factory).slice(args.length),
                    _apply(_factory, args));
            })),

            build: function (registeredResolve, registeredScope) {
                if (!self.keys().length)
                    throw new Error("No key defined for registration");
                if (notDefined(_factory))
                    throw new Error("No factory defined for " + name(self.keys()[0]) + " registration");

                return extend(_factory, {
                    withLifeTime: dependant([resolveFn, scopeFn, locals],
                        _call(_lifeTime, _factory, registeredResolve, registeredScope))
                });
            }
        });

        function validate() {
            if (isDefined(_constructor)) {
                verifyIsFunction(_constructor, "Constructor");
                self.keys().forEach(function (key) {
                    if (isFunction(key) && _constructor != key && !(_constructor.prototype instanceof key))
                        throw new Error(
                            (_constructor.name || "Anonymous type")
                                + " does not inherit from "
                                + (key.name || "anonymous base type"));
                });
            }

            if (isDefined(_value))
                self.keys()
                    .filter(isFunction)
                    .forEach(unary(call_(verifyType, _value)));

            if (isDefined(_function)) {
                verifyIsFunction(_function);
                if (self.keys().some(isFunction))
                    throw new Error("A type cannot be resolved to a function");
            }

            if (isDefined(_factory))
                verifyIsFunction(_factory, "Factory");
        }

        if (isDefined(factory))
            self.call(factory);
        self.perContainer();
    }

    function resolveChainMessage() {
        return resolveChain.length > 1
            ? " while attempting to resolve "
                + resolveChain
                .slice(0, -1)
                .map(name)
                .join(' -> ')
            : '';
    }

    function dependencyKeys(ctor) {
        return ctor.dependencies || [];
    }

    function name(key) {
        return isFunction(key)
            ? key.name || "Type"
            : "'" + key + "'";
    }

    function newScope() {
        var keys = [],
            values = [],
            lookup = newLookup(keys, values);

        return extend(
            function scope(key, resolveForKey) {
                return lookup(key, function () {
                    var value = resolveForKey();
                    keys.push(key);
                    values.push(value);
                    return disposable(value);
                });
            }, {
                dispose: function () {
                    values
                        .filter(isDisposable)
                        .forEach(function (value) { value.dispose(); });

                    // Clear arrays to help avoid memory leaks
                    keys.length = 0;
                    values.length = 0;
                }
            });

        function isDisposable(value) {
            return value
                && value.dispose;
        }

        function disposable(value) {
            if (isDisposable(value))
                value.dispose = compose(value.dispose, _call(lookup.remove, value));
            return value;
        }
    }

    function newLocalLookup(keys, values) {
        return function localLookup(key, fallback) {
            var i = keys.indexOf(key);
            return key == locals ? { keys: keys, values: values }
                : i < 0 ? fallback(key)
                : (keys.splice(i, 1), values.splice(i, 1)[0]);
        };
    }

    function newLookup(keys, values, parent) {
        parent = parent || { all: constant([]) };
        return extend(
            function lookup(key, fallback) {
                var value = last(key ? all(key) : []);
                return isDefined(value)
                    ? value
                    : (fallback || constant())();
            },
            {
                remove: function (value) {
                    var i = values.indexOf(value);
                    if (i >= 0) {
                        keys.splice(i, 1);
                        values.splice(i, 1);
                    }
                },
                all: all
            }
        );

        function all(key) {
            return parent.all(key)
                .concat(values.filter(function (_, i) {
                    return keys[i] == key;
                }));
        }
    }

    function verifyType(key, value) {
        if (notDefined(value))
            throw new Error(name(key) + " resolved to undefined" + resolveChainMessage());
        if (value === null)
            return value;
        if (isFunction(key) && !(value instanceof key))
            throw new Error('Value does not inherit from ' + name(key));
        return value;
    }

    function verifyIsFunction(fn, name) {
        if (!isFunction(fn))
            throw new Error(name + " is not a function");
    }

    function verifyArity(dependencies, fn) {
        if (dependencies.length != fn.length) {
            var dependenciesMsg = dependencies.length == 1 ? "1 dependency" : dependencies.length + " dependencies",
                paramsMsg = fn.length == 1 ? "1 parameter" : fn.length + " parameters";
            throw new Error(name(fn) + " has " + dependenciesMsg + ", but " + paramsMsg);
        }
    }

    function defaultArg(arg, defaultValue) {
        return notDefined(arg)
            ? defaultValue
            : arg;
    }

    function constant(value) {
        return function () {
            return value;
        };
    }

    function noLifeTime(factory) {
        return extend(factory, { withLifeTime: factory });
    }

    function constructor(fn) {
        return dependant(dependencyKeys(fn), variadic(function constructorFn(args) {
            return new (Function.prototype.bind.apply(fn, [null].concat(args)));
        }));
    }

    function dependant(dependencies, fn) {
        if (dependencies.some(notDefined))
            throw new Error(name(fn) + " has an undefined dependency");

        return extend(fn, { dependencies: dependencies });
    }

    function chain(fn) {
        return compose(fn, function () {
            return this;
        });
    }

    function compose(f, g) {
        return function composed() {
            return g.call(this, f.apply(this, arguments));
        };
    }

    function extend(obj, extra) {
        Object.keys(extra).forEach(function (key) {
            obj[key] = extra[key];
        });
        return obj;
    }

    function repeat(value, times) {
        var array = [];
        while (times--)
            array.push(value);
        return array;
    }

    function flatMap(array, mapFn) {
        return Array.prototype.concat.apply([], array.map(mapFn));
    }

    function last(array) {
        return array[array.length - 1];
    }

    function _apply(fn, args) {
        return variadic(function partial(moreArgs) {
            return fn.apply(this, args.concat(moreArgs));
        });
    }

    function apply_(fn, args) {
        return variadic(function partial(moreArgs) {
            return fn.apply(this, moreArgs.concat(args));
        });
    }

    function apply(fn, args) {
        return fn.apply(this, args);
    }

    function variadic(fn) {
        return function variadic() {
            var args = Array.prototype.slice.call(arguments);
            var precedingArgs = args.slice(0, fn.length - 1);
            var variadicArgs = args.slice(fn.length - 1);
            return fn.apply(this, precedingArgs.concat([variadicArgs]));
        };
    }

    function unary(fn) {
        return function unary(arg) {
            return fn.call(this, arg);
        }
    }

    function isFunction(fn) {
        return typeof fn == 'function';
    }

    function notDefined(value) {
        return !isDefined(value);
    }

    function isDefined(value) {
        return typeof value != 'undefined';
    }
})();
