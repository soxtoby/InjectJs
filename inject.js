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
            ? parentResolve(new Registration(constant(extendedResolve())))
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
                return verifyType(key, resolveFunction(defaultFactory(key)));
            } finally{
                resolveChain.pop();
            }
        }

        function resolveFunction(fn, localKeys, localValues) {
            return fn.apply(this, resolveDependencies(dependencyKeys(fn), localKeys || [], localValues || []));
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
                .map(function (r) { return r.key; })
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

        ctor: function (dependencies, fn) {
            verifyArity(dependencies, fn);

            return ctor(dependencies, fn);
        },

        forType: function (type) {
            verifyIsFunction(type, "Registration type");

            return new Registration().forType(type).create(type);
        },

        create: function (type) {
            return inject.forType(type);
        },

        forKey: function (key) {
            if (typeof key != 'string')
                throw new Error("Registration key is not a string");
            return new Registration().forKey(key);
        },

        createSingle: function (type) {
            return inject.create(type).once();
        },

        factory: function (fn) {
            return new Registration(fn);
        },

        value: function (value) {
            return new Registration(constant(value));
        },

        function: function (fn) {
            return new Registration().resolveFunction(fn);
        },

        func: function (key, funcDependencies) {
            // TODO should be perDependency
            return new Registration(ctor([resolveFn], function (resolve) {
                return variadic(function(args) {
                    return resolve.function(resolve.defaultFactory(key), funcDependencies, args);
                });
            }));
        },

        optional: function (key, defaultValue) {
            return new Registration(ctor([resolveFn], function (resolve) {
                var defaultValueFactory = constant(defaultArg(defaultValue, null));
                return resolve.function(
                    resolve.injected(key, constant(defaultValueFactory)));
            }));
        },

        named: function (type, key) {
            return new Registration(ctor([key], pcall(verifyType, type)))
        }
    });

    function resolveChainMessage() {
        return resolveChain.length > 1
            ? " while attempting to resolve "
            + resolveChain
                .slice(0, -1)
                .map(name)
                .join(' -> ')
            : '';
    }

    function constructor(fn) {
        return ctor(dependencyKeys(fn), variadic(function constructorFn(args) {
            return new (Function.prototype.bind.apply(fn, [null].concat(args)));
        }));
    }

    function dependencyKeys(ctor) {
        return ctor.dependencies || [];
    }

    function name(key) {
        return isFunction(key)
            ? key.name || "Type"
            : "'" + key + "'";
    }

    function papply(fn, args) {
        return variadic(function partial(moreArgs) {
            return fn.apply(this, args.concat(moreArgs));
        });
    }

    function newScope() {
        var keys = [],
            values = [],
            lookup = newLookup(keys, values);

        return extend(
            function scope(key, resolveForKey) {
                return lookup(key, function() {
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
                value.dispose = decorate(value.dispose, pcall(lookup.remove, value));
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

    function ctor(dependencies, fn) {
        if (dependencies.some(notDefined))
            throw new Error(name(fn) + " has an undefined dependency");

        return extend(fn, { dependencies: dependencies });
    }

    function chain(fn) {
        return decorate(fn, function() {
            return this;
        });
    }

    function decorate(fn, decoration) {
        return function decorated() {
            var result = fn.apply(this, arguments);
            return decoration.call(this, result);
        };
    }

    function extend(obj, extra) {
        Object.keys(extra).forEach(function (key) {
            obj[key] = extra[key];
        });
        return obj;
    }

    function variadic(fn) {
        return function variadic() {
            var args = Array.prototype.slice.call(arguments);
            var precedingArgs = args.slice(0, fn.length - 1);
            var variadicArgs = args.slice(fn.length - 1);
            return fn.apply(this, precedingArgs.concat([variadicArgs]));
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

    function verifyIsSubType(superType, subType) {
        if (isFunction(superType) && subType != superType && !(subType.prototype instanceof superType))
            throw new Error(
                (subType.name || "Anonymous type")
                    + " does not inherit from "
                    + (superType.name || "anonymous base type"));
    }

    function verifyArity(dependencies, fn) {
        if (dependencies.length != fn.length)
        {
            var dependenciesMsg = dependencies.length == 1 ? "1 dependency" : dependencies.length + " dependencies",
                paramsMsg = fn.length == 1 ? "1 parameter" : fn.length + " parameters";
            throw new Error(name(fn) + " has " + dependenciesMsg + ", but " + paramsMsg);
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

    function Registration(create) {
        if (isDefined(create))
            this.call(create);
        this.perContainer();
    }

    Registration.prototype = {
        forType: chain(function (type) {
            if (this._constructor)
                verifyIsSubType(type, this._constructor);

            this.key = type;
        }),

        forKey: chain(function (key) {
            this.key = key;
        }),

        create: chain(function (type) {
            verifyIsFunction(type, "Type");
            verifyIsSubType(this.key, type);

            this._constructor = type;
            this.factory = constructor(type);
        }),

        use: chain(function (value) {
            if (notDefined(value))
                throw new Error("Value is undefined");
            verifyType(this.key, value);

            this.factory = constant(value);
            this.doNotDispose();
        }),

        call: chain(function (fn) {
            verifyIsFunction(fn, "Factory");

            this.factory = fn;
        }),

        resolveFunction: chain(function (fn) {
            verifyIsFunction(fn);
            if (isFunction(this.key))
                throw new Error("A type cannot be resolved to a function");

            this.factory = ctor(dependencyKeys(fn), variadic(function (dependencies) {
                return variadic(function (args) {
                    return fn.apply(this, dependencies.concat(args));
                });
            }));
        }),

        once: chain(function () {
            var key = this.key;
            this._lifeTime = function (factory, registeredResolve, registeredScope, resolve, currentScope) {
                return registeredScope(key, pcall(registeredResolve.function, factory));
            };
        }),

        perContainer: chain(function () {
            var key = this.key;
            this._lifeTime = function (factory, registeredResolve, registeredScope, resolve, currentScope) {
                return currentScope(key, pcall(resolve.function, factory));
            };
        }),

        perDependency: chain(function () {
            this._lifeTime = function (factory, registeredResolve, registeredScope, resolve, currentScope) {
                return currentScope(null, pcall(resolve.function, factory));
            };
        }),

        doNotDispose: chain(function () {
            var innerLifetime = this._lifeTime;
            this._lifeTime = function (factory, registeredResolve, registeredScope, resolve, currentScope) {
                return innerLifetime(
                        function () { return constant(resolve.function(factory)); },
                        registeredResolve, registeredScope, resolve, currentScope)
                    ();
            };
        }),

        then: chain(function (callback) {
            this.factory = ctor(dependencyKeys(this.factory),
                decorate(this.factory, function (value) {
                    callback(value);
                    return value;
                }));
        }),

        useParameterHook: chain(function (hook) {
            verifyIsFunction(hook, 'Parameter hook');

            var innerFactory = this.factory;
            this.factory = ctor([resolveFn], function (resolve) {
                var originalKeys = dependencyKeys(innerFactory);
                var hookedKeys = originalKeys.map(function (key) {
                    var hookValue = hook(resolve, key);
                    return isDefined(hookValue)
                        ? new Registration(constant(hookValue))
                        : key;
                });

                return resolve.function(ctor(hookedKeys, pcall(innerFactory)));
            });
        }),

        withDependency: function(key, value) {
            return this.useParameterHook(function (resolve, paramKey) {
                if (paramKey == key) return value;
            });
        },

        withArguments: chain(variadic(function (args) {
            this.factory = ctor(
                dependencyKeys(this.factory).slice(args.length),
                papply(this.factory, args));
        })),

        build: function (registeredResolve, registeredScope) {
            return ctor([resolveFn, scopeFn],
                pcall(this._lifeTime, this.factory, registeredResolve, registeredScope));
        }
    };
    window.Injection = { RegistrationBuilder: Registration }; // TODO remove, just for old tests
})();
