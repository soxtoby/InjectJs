(function () {
    var resolveFn = 'inject.resolveFn';
    var scopeFn = 'inject.scope'; // Key for current scope
    var pcall = variadic(papply);
    var resolveChain = [];

    window.inject = extend(function inject(registrations, parentResolve) {
        var scope = newScope(),
            getInjectedFactory = newLookup(registeredKeys(), registeredFactories()),
            getParentFactory = parentResolve && parentResolve.injected || newLookup([], []);

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

            resolveChain.push(key);
            try {
                return verifyType(key, resolveFunction(defaultFactory(key))());
            } finally {
                resolveChain.pop();
            }
        }

        function resolveFunction(fn, localKeys, localValues) {
            return variadic(function (args) {
                return fn.apply(this, resolveDependencies(dependencyKeys(fn), localKeys || [], localValues || []).concat(args));
            });
        }

        function resolveInjected(key, fallback) {
            return getInjectedFactory(key, function () {
                return getParentFactory(key, fallback);
            })
        }

        function defaultFactory(key) {
            var injectedFn = resolve.injected(key);

            if (key instanceof Registration)
                return key.build(resolve, scope);
            if (injectedFn)
                return injectedFn;
            if (isFunction(key))
                return constructor(key);
            throw new Error('Failed to resolve key ' + name(key) + resolveChainMessage());
        }

        function resolveDependencies(required, localKeys, localValues) {
            var local = newLocalLookup(localKeys, localValues);

            return required.map(function (key) {
                return local(key, resolve);
            });
        }

        function registeredKeys() {
            return (registrations || [])
                .map(function (r) {
                    return r.key();
                })
                .concat(resolveFn, scopeFn);
        }

        function registeredFactories() {
            return (registrations || [])
                .map(function (r) {
                    return r.build(resolve, scope);
                })
                .concat(constant(resolve), constant(scope));
        }
    }, {
        resolve: resolveFn,

        dependant: dependant,

        ctor: function (dependencies, fn) {
            verifyArity(dependencies, fn);

            return dependant(dependencies, fn);
        },

        forType: function (type) {
            return inject.type(type);
        },

        type: function (type) {
            verifyIsFunction(type, "Registration type")
            return new Registration().forType(type).create(type);
        },

        forKey: function (key) {
            return new Registration().forKey(key);
        },

        single: function (type) {
            return inject.forType(type).once();
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
            // TODO should be perDependency
            return new Registration(dependant([resolveFn], function (resolve) {
                return variadic(function (args) {
                    return resolve.function(resolve.defaultFactory(key), funcDependencies, args)();
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
            return new Registration(dependant([key], pcall(verifyType, type)), null)
        }
    });

    function Registration(factory, key) {
        var self = this,
            _key = key,
            _factory,
            _lifeTime,
            _constructor,
            _value,
            _function;

        extend(self, {
            key: function () { return _key; },

            forType: chain(function (type) {
                _key = defaultArg(type, null);
                validate();
            }),

            forKey: chain(function (key) {
                if (typeof key != 'string')
                    throw new Error("Registration key is not a string");

                _key = key;
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
                _factory = dependant([resolveFn], function (resolve) {
                    return resolve.function(fn);
                });

                validate();
            }),

            once: chain(function () {
                _lifeTime = function (factory, registeredResolve, registeredScope, resolve, currentScope) {
                    return registeredScope(_key, registeredResolve.function(factory));
                };
            }),

            perContainer: chain(function () {
                _lifeTime = function (factory, registeredResolve, registeredScope, resolve, currentScope) {
                    return currentScope(_key, resolve.function(factory));
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
                _factory = dependant([resolveFn], function (resolve) {
                    var originalKeys = dependencyKeys(innerFactory);
                    var hookedKeys = originalKeys.map(function (key) {
                        var hookValue = hook(resolve, key);
                        return isDefined(hookValue)
                            ? new Registration(constant(hookValue), null)
                            : key;
                    });

                    return resolve.function(dependant(hookedKeys, pcall(innerFactory)))();
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
                    papply(_factory, args));
            })),

            build: function (registeredResolve, registeredScope) {
                if (notDefined(_key))
                    throw new Error("No key defined for registration");
                if (notDefined(_factory))
                    throw new Error("No factory defined for " + name(_key) + " registration");

                return dependant([resolveFn, scopeFn],
                    pcall(_lifeTime, _factory, registeredResolve, registeredScope));
            }
        });

        function validate() {
            if (isDefined(_constructor)) {
                verifyIsFunction(_constructor, "Constructor");
                if (isFunction(_key) && _constructor != _key && !(_constructor.prototype instanceof _key))
                    throw new Error(
                        (_constructor.name || "Anonymous type")
                            + " does not inherit from "
                            + (_key.name || "anonymous base type"));
            }

            if (isDefined(_value) && isFunction(_key))
                verifyType(_key, _value);

            if (isDefined(_function)) {
                verifyIsFunction(_function);
                if (isFunction(_key))
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
                    values.slice().forEach(function (value) {
                        if ('dispose' in value)
                            value.dispose();
                    });
                }
            });

        function disposable(value) {
            if (value && 'dispose' in value)
                value.dispose = compose(value.dispose, pcall(lookup.remove, value));
            return value;
        }
    }

    function newLocalLookup(keys, values) {
        return function localLookup(key, fallback) {
            var i = keys.indexOf(key);
            return i < 0 ? fallback(key)
                : (keys.splice(i, 1), values.splice(i, 1)[0]);
        }
    }

    function newLookup(keys, values) {
        return extend(
            function lookup(key, fallback) {
                var i = key ? keys.indexOf(key) : -1;
                return i >= 0
                    ? values[i]
                    : (fallback || constant())();
            },
            {
                remove: function (value) {
                    var i = values.indexOf(value);
                    if (i >= 0) {
                        keys.splice(i, 1);
                        values.splice(i, 1);
                    }
                }
            }
        );
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

    function papply(fn, args) {
        return variadic(function partial(moreArgs) {
            return fn.apply(this, args.concat(moreArgs));
        });
    }

    function variadic(fn) {
        return function variadic() {
            var args = Array.prototype.slice.call(arguments);
            var precedingArgs = args.slice(0, fn.length - 1);
            var variadicArgs = args.slice(fn.length - 1);
            return fn.apply(this, precedingArgs.concat([variadicArgs]));
        }
    }

    function isFunction(fn) {
        return typeof fn == 'function';
    }

    function notDefined(value) {
        return !isDefined(value)
    }

    function isDefined(value) {
        return typeof value != 'undefined';
    }
})();
