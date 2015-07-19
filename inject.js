(function () {
    var maxDependencyDepth = 20;
    var resolveFn = 'inject.resolveFn';
    var scopeFn = 'inject.scope'; // Key for current scope
    var locals = 'inject.locals';
    var _call = variadic(_apply);
    var call_ = variadic(apply_);
    var call = variadic(apply);
    var resolveChain = [];
    var uid = 1;

    window.inject = extend(function inject(registrations, parentResolve) {
        var scope = newScope(),
            resolveInjected = newLookup(registeredKeys(), registeredFactories(), parentResolve && parentResolve.injected);

        return parentResolve
            ? parentResolve(constant(extendedResolve()))
            : extendedResolve();

        function extendedResolve() {
            return extend(resolve, {
                injected: resolveInjected,
                dispose: compose(scope.dispose, resolveInjected.dispose),
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
                return verifyType(key, resolveFunction(defaultFactory(key))());
            } finally {
                resolveChain.pop();
            }
        }

        function resolveFunction(fn, localKeys, localValues) {
            return variadic(named([fn, '.resolved'], function (args) {
                return fn.apply(this, resolveDependencies(dependencyKeys(fn), localKeys || [], localValues || []).concat(args));
            }));
        }

        function defaultFactory(key) {
            var injectedFn = resolve.injected(key);

            if (injectedFn)
                return injectedFn;
            if (isConstructor(key))
                return resolve.injected.add(key, inject.type(key).build(resolve, scope));
            if (isFunction(key))
                return inject.factory(key).build(resolve, scope);
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
                    function (r) { return repeat(r.verifiedBuild(resolve, scope), r.keys().length); })
                .concat(constant(resolve), constant(scope));
        }
    }, {
        resolve: resolveFn,

        dependant: dependant,

        dependantFn: function dependantFn(dependencies, fn) {
            fn = isFunction(dependencies)
                ? dependencies
                : dependant(dependencies, fn);
            return factory(dependant([resolveFn, locals], function (resolve, local) {
                return resolve.function(fn, local.keys, local.values);
            }));
        },

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
                    .concat(isDefined(value) ? [constant(value)] : []);
            };
            return fallbackResolve;
        },

        forType: function (type) {
            verifyIsFunction(type, "Registration type");
            return registration().forType(type);
        },

        forTypes: function (types) {
            types.forEach(unary(call_(verifyIsFunction, "Registration type")));
            return registration().forTypes(types);
        },

        type: function (type) {
            verifyIsFunction(type, "Registration type");
            return registration().create(type);
        },

        forKey: function (key) {
            return registration().forKey(key);
        },

        forKeys: function (keys) {
            return registration().forKeys(keys);
        },

        single: function (type) {
            return inject.forType(type).create(type).once();
        },

        factory: function (fn) {
            return registration().call(fn);
        },

        value: function (value) {
            return registration().use(value);
        },

        function: function (fn) {
            return registration().resolveFunction(fn);
        },

        func: function (key, funcDependencies) {
            return factory(dependant([resolveFn, scopeFn], function (resolve, scope) {
                return variadic(named(['('].concat((funcDependencies || []).map(name), ') -> ', name(key)), function (args) {
                    return scope(null, resolve.function(resolve.defaultFactory(key).withoutLifeTime, funcDependencies, args));
                }));
            }));
        },

        optional: function (key, defaultValue) {
            return factory(dependant([resolveFn], function (resolve) {
                var defaultValueFactory = constant(defaultArg(defaultValue, null));
                return resolve.function(
                        resolve.injected(key, constant(defaultValueFactory)))
                    ();
            }));
        },

        named: function (type, key) {
            return factory(dependant([key], _call(verifyType, type)));
        },

        all: function (key) {
            return factory(dependant([resolveFn], function (resolve) {
                return resolve.injected.all(key)
                    .map(unary(resolve.function))
                    .map(unary(call))
                    .map(_call(verifyType, key));
            }));
        }
    });

    function registration() {
        var self = {},
            _keys = [],
            _factory,
            _lifeTime,
            _constructor,
            _value,
            _function;

        return extend(self, {
            keys: function () {
                return !_keys.length && (_constructor || _function)
                    ? [_constructor || _function]
                    : _keys;
            },

            forType: chain(function forType(type) {
                self.forTypes([type]);
            }),

            forTypes: chain(function forTypes(types) {
                _keys = _keys.concat(types);
                validate();
            }),

            forKey: chain(function forKey(key) {
                self.forKeys([key]);
            }),

            forKeys: chain(function forKeys(keys) {
                if (keys.some(function (key) { return typeof key != 'string'; }))
                    throw new Error("Registration key is not a string");

                _keys = _keys.concat(keys);
                validate();
            }),

            create: chain(function create(type) {
                _constructor = defaultArg(type, null);
                _factory = constructor(type);

                validate();
            }),

            use: chain(function use(value) {
                if (notDefined(value))
                    throw new Error("Value is undefined");

                _value = value;
                _factory = _lifeTime = constant(defaultArg(value, null));

                validate();
            }),

            call: chain(function call(fn) {
                _factory = defaultArg(fn, null);
                validate();
            }),

            resolveFunction: chain(function resolveFunction(fn) {
                _function = fn;
                _factory = dependant([resolveFn, locals], function (resolve, local) {
                    return resolve.function(fn, local.keys, local.values);
                });

                validate();
            }),

            once: chain(function once() {
                _lifeTime = function singletonLifetime(factory, registeredResolve, registeredScope, resolve, currentScope) {
                    return registeredScope(self, registeredResolve.function(factory));
                };
            }),

            perContainer: chain(function perContainer() {
                _lifeTime = function perContainerLifetime(factory, registeredResolve, registeredScope, resolve, currentScope) {
                    return currentScope(self, resolve.function(factory));
                };
            }),

            perDependency: chain(function perDependency() {
                _lifeTime = function transientLifetime(factory, registeredResolve, registeredScope, resolve, currentScope) {
                    return currentScope(null, resolve.function(factory));
                };
            }),

            then: chain(function then(callback) {
                _factory = dependant(dependencyKeys(_factory),
                    compose(_factory, function (value) {
                        callback(value);
                        return value;
                    }));
            }),

            useParameterHook: chain(function useParameterHook(hook) {
                verifyIsFunction(hook, 'Parameter hook');

                var innerFactory = _factory;
                _factory = dependant([resolveFn, locals], function (resolve, local) {
                    var originalKeys = dependencyKeys(innerFactory);
                    var hookedKeys = originalKeys.map(function (key) {
                        var hookValue = hook(resolve, key);
                        return isDefined(hookValue)
                            ? constant(hookValue)
                            : key;
                    });

                    return resolve.function(dependant(hookedKeys, _call(innerFactory)), local.keys, local.values)();
                });
            }),

            withDependency: chain(function withDependency(key, value) {
                verifyType(key, value);

                self.useParameterHook(function (resolve, paramKey) {
                    if (paramKey === key) return value;
                });
            }),

            withArguments: chain(variadic(function withArguments(args) {
                _factory = dependant(
                    dependencyKeys(_factory).slice(args.length),
                    _apply(_factory, args));
            })),

            verifiedBuild: function (registeredResolve, registeredScope) {
                if (!self.keys().length)
                    throw new Error("No key defined for registration");
                if (notDefined(_factory))
                    throw new Error("No factory defined for " + name(self.keys()[0]) + " registration");

                return self.build(registeredResolve, registeredScope);
            },

            build: function (registeredResolve, registeredScope) {
                return extend(dependant(
                    [resolveFn, scopeFn, locals],
                    _call(_lifeTime, _factory, registeredResolve, registeredScope)), {
                        withoutLifeTime: _factory
                    });
            }
        })
            .perContainer();

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
                if (self.keys().filter(isFunction).some(function (k) { return k != _function }))
                    throw new Error("A function can only be registered for a string key or itself");
            }

            if (isDefined(_factory))
                verifyIsFunction(_factory, "Factory");
        }
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
        var lookup = newLookup([], []);

        return extend(
            function scope(key, resolveForKey) {
                return lookup(key, named(['(resolve ', key, ')'], function () {
                    var value = resolveForKey();
                    return key || isDisposable(value)
                        ? lookup.add(key, disposable(key, value))
                        : value;
                }));
            }, {
                dispose: function () {
                    lookup.values()
                        .filter(isDisposable)
                        .forEach(function (value) { value.dispose(); });
                    lookup.dispose();
                }
            });

        function isDisposable(value) {
            return value
                && isFunction(value.dispose);
        }

        function disposable(key, value) {
            if (isDisposable(value))
                value.dispose = compose(value.dispose, _call(lookup.remove, key, value));
            return value;
        }
    }

    function newLocalLookup(keys, values) {
        return function localLookup(key, fallback) {
            var i = keys.indexOf(key);
            keys = keys.slice();    // Don't want to modify someone else's arrays
            values = values.slice();
            return key == locals ? { keys: keys, values: values }
                : i < 0 ? fallback(key)
                : (keys.splice(i, 1), values.splice(i, 1)[0]);
        };
    }

    function newLookup(initialKeys, initialValues, parent) {
        var map = {};
        initialKeys.forEach(function (key, i) {
            add(key, initialValues[i]);
        });

        parent = parent || { all: constant([]) };
        return extend(
            function lookup(key, fallback) {
                var value = last(key ? all(key) : []);
                return isDefined(value)
                    ? value
                    : (fallback || constant())();
            },
            {
                add: add,
                remove: function (key, value) {
                    var values = map[mapKey(key)] || [];
                    var i = values.indexOf(value);
                    if (i >= 0)
                        values.splice(i, 1);
                },
                values: function () {
                    return flatMap(Object.keys(map), function (key) { return map[key]; });
                },
                all: all,
                dispose: function () {
                    Object.keys(map).forEach(function (key) {
                        delete map[key];
                    });
                }
            }
        );

        function add(key, value) {
            key = mapKey(key);
            if (!map[key])
                map[key] = [];
            map[key].push(value);
            return value;
        }

        function all(key) {
            return parent.all(key)
                .concat(map[mapKey(key)] || []);
        }

        function mapKey(key) {
            return !key ? '\0'
                : typeof key == 'string' ? key
                : key._injectKey ? key._injectKey
                : (key._injectKey = uid++);
        }
    }

    function verifyType(key, value) {
        if (notDefined(value))
            throw new Error(name(key) + " resolved to undefined" + resolveChainMessage());
        if (value === null)
            return value;
        if (isConstructor(key) && !(value instanceof key))
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
        return factory(named([value], function () {
            return value;
        }));
    }

    function constructor(fn) {
        return dependant(dependencyKeys(fn), variadic(named([fn, '.new'], function constructorFn(args) {
            return new (Function.prototype.bind.apply(fn, [null].concat(args)));
        })));
    }

    function factory(fn) {
        return extend(fn, { isFactory: true });
    }

    function dependant(dependencies, fn) {
        if (dependencies.some(notDefined))
            throw new Error(name(fn) + " has an undefined dependency");

        return extend(fn, { dependencies: dependencies });
    }

    function chain(fn) {
        return compose(fn, named(['this'], function () {
            return this;
        }));
    }

    function compose(f, g) {
        return named(['(', f, ' >> ', g, ')'], function composed() {
            return g.call(this, f.apply(this, arguments));
        });
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
        return variadic(named([fn, '.partial(', args.map(argName).join(', ') + ', ?)'], function partial(moreArgs) {
            return fn.apply(this, args.concat(moreArgs));
        }));
    }

    function apply_(fn, args) {
        return variadic(named([fn, '.partial(?, ' + args.map(argName).join(', '), ')'], function partial(moreArgs) {
            return fn.apply(this, moreArgs.concat(args));
        }));
    }

    function apply(fn, args) {
        return fn.apply(this, args);
    }

    function variadic(fn) {
        var singularArgs = fn.length - 1;
        return named([fn, '.variadic'], function variadic() {
            var args = Array.prototype.slice.call(arguments, 0, singularArgs);
            var rest = Array.prototype.slice.call(arguments, singularArgs);
            args.push(rest);
            return fn.apply(this, args);
        });
    }

    function unary(fn) {
        return named([fn, '.unary'], function unary(arg) {
            return fn.call(this, arg);
        });
    }

    function named(parts, fn) {
        fn.displayName = parts.map(argName).join('');
        return fn;
    }

    function argName(value) {
        return isFunction(value)
            ? value.displayName
                ? value.displayName
                : value.name || 'anonymous function'
            : value
    }

    function isConstructor(fn) {
        return isFunction(fn) && !fn.isFactory;
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
