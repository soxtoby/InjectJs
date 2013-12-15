(function (global) {
    'use strict';

    var uid = 1;
    var parameterMarker = 'param:';
    var undefined;

    function ContainerBuilder(parentRegistrationMap) {
        this._parentRegistrationMap = parentRegistrationMap || {};
        this._registrationBuilders = [];
        this.useInstancePerContainer();
    };

    ContainerBuilder.prototype = {
        build: function () {
            this._containerBuilt = true;

            var registrationMap = Object.create(this._parentRegistrationMap);

            var container = new Container(registrationMap, this._defaultLifetime);

            this._registrationBuilders.forEach(function (builder) {
                registrationMap[getOrCreateKey(builder.registeredAs)] = builder.build(container);
            });

            return container;
        },

        forType: function (type) {
            return this._createRegistration().create(type);
        },

        forKey: function (key) {
            return this._createRegistration().forKey(key);
        },

        forParameter: function (name) {
            return this._createRegistration().forParameter(name);
        },

        create: function (type) {
            return this.forType(type);
        },

        createSingle: function (type) {
            return this._createRegistration().createSingle(type);
        },

        call: function (factory) {
            return this._createRegistration().call(factory);
        },

        use: function (value) {
            return this._createRegistration().use(value);
        },

        useInstancePerContainer: function () {
            this._defaultLifetime = instancePerContainer;
        },

        useInstancePerDependency: function () {
            this._defaultLifetime = instancePerDependency;
        },

        setDefaultLifetime: function (lifetime) {
            this._defaultLifetime = lifetime;
        },

        _createRegistration: function () {
            if (this._containerBuilt)
                throw new Error('Cannot register anything else once the container has been built');

            var registration = new RegistrationBuilder(this._defaultLifetime);
            this._registrationBuilders.push(registration);
            return registration;
        }
    };

    function RegistrationBuilder(buildLifetime) {
        this._buildLifetime = buildLifetime || instancePerDependency;
        this._parameterHooks = [];
    }

    RegistrationBuilder.prototype = {
        forType: function (type) {
            if (typeof type != 'function')
                throw new Error('Registration type is not a function');

            this.name = type.name;
            this.registeredAs = type;

            this._ensureTyping();

            return this;
        },

        forKey: function (key) {
            if (typeof key != 'string')
                throw new Error('Registration key is not a string');

            this.name = "'" + key + "'";
            this.registeredAs = key;
            return this;
        },

        forParameter: function (name) {
            if (typeof name != 'string')
                throw new Error('Parameter name is not a string');

            this.name = "param: '" + name + "'";
            this.registeredAs = paramKey(name);
            return this;
        },

        create: function (type) {
            if (!this.registeredAs)
                this.forType(type);

            if (typeof type != 'function')
                throw new Error('Type is not a function');

            this._resolvesTo = type;
            this._ensureTyping();

            return this.call(constructorFactory(type));
        },

        use: function (value) {
            if (value === undefined)
                throw new Error('Value is undefined');

            this._resolvesTo = value;
            this._ensureTyping();

            this._buildLifetime = unmanagedLifetime;

            return this.call(valueFactory(value));
        },

        call: function (factory) {
            if (typeof factory != 'function')
                throw new Error('Factory is not a function');

            this._instanceFactory = factory;
            return this;
        },

        once: function () {
            this._buildLifetime = singleInstance;
            return this;
        },

        createSingle: function (type) {
            return this.create(type).once();
        },

        perContainer: function () {
            this._buildLifetime = instancePerContainer;
            return this;
        },

        perDependency: function () {
            this._buildLifetime = instancePerDependency;
            return this;
        },

        withArguments: function () {
            var args = arguments;
            for (var i = 0; i < args.length; i++) {
                (function (index, arg) {
                    this.useParameterHook(function (p) {
                        return p.index == index;
                    }, function () {
                        return arg;
                    });
                }).bind(this)(i, args[i]);
            }
            return this;
        },

        withParameters: function (parameters) {
            Object.keys(parameters).forEach(function (name) {
                this.withParameterNamed(name).using(parameters[name]);
            }, this);
            return this;
        },

        withParameterNamed: function (name) {
            if (typeof name != 'string')
                throw new Error('Parameter name is not a string');

            return new ParameterRegistration(this, function (p) {
                return p.name == name;
            });
        },

        withParameterTyped: function (type) {
            if (typeof type != 'function')
                throw new Error('Parameter type is not a function');

            return new ParameterRegistration(this, function (p) {
                return p.type == type;
            }, type);
        },

        useParameterHook: function (matchParameter, resolveValue) {
            var hook = matchParameter instanceof ParameterHook
                ? matchParameter
                : new ParameterHook(matchParameter, resolveValue);
            this._parameterHooks.push(hook);
            return this;
        },

        then: function (callback) {
            this._buildPostCreate = function (registrationBuilder, registrationContainer, instanceFactory) {
                return function (resolvingContainer) {
                    var value = instanceFactory(resolvingContainer);
                    callback(value, resolvingContainer);
                    return value;
                };
            };
        },

        _buildPostCreate: function (registrationBuilder, registrationContainer, instanceFactory) {
            return instanceFactory;
        },

        _ensureTyping: function () {
            ensureTyping(this.registeredAs, this._resolvesTo);
        },

        build: function (container) {
            var instanceFactoryWithPostCreate = this._buildPostCreate(this, container, this._instanceFactory);
            var instanceFactoryWithPostCreateAndLifetime = this._buildLifetime(this, container, instanceFactoryWithPostCreate);
            return new Registration(this.name, instanceFactoryWithPostCreateAndLifetime, this._parameterHooks);
        }
    };

    function Registration(name, instanceFactory, parameterHooks) {
        this.name = name;
        this._instanceFactory = instanceFactory;
        this.parameterHooks = parameterHooks;
    }

    Registration.prototype = {
        factory: function (container) {
            return this._instanceFactory(container, this);
        }
    };

    function instancePerDependency(registrationBuilder, registrationContainer, instanceFactory) {
        return function (resolvingContainer, registration) {
            var instance = instanceFactory(resolvingContainer, registration);
            resolvingContainer.registerDisposable(instance);
            return instance;
        };
    }

    function singleInstance(registrationBuilder, registrationContainer, instanceFactory) {
        var key = getOrCreateKey(registrationBuilder.registeredAs);
        return function (resolvingContainer, registration) {
            return registrationContainer._containerScope.getOrCreate(key, registration, instanceFactory);
        };
    }

    function instancePerContainer(registrationBuilder, registrationContainer, instanceFactory) {
        var key = getOrCreateKey(registrationBuilder.registeredAs);
        return function (resolvingContainer, registration) {
            return resolvingContainer._containerScope.getOrCreate(key, registration, instanceFactory);
        };
    }

    function unmanagedLifetime(registrationBuilder, registrationContainer, instanceFactory) {
        return function (resolvingContainer, registration) {
            return instanceFactory(resolvingContainer, registration);
        };
    }

    function ParameterRegistration(typeRegistration, matchParameter, parameterType) {
        this._typeRegistration = typeRegistration;
        this._matchParameter = matchParameter;
        this._parameterType = parameterType;
    }

    ParameterRegistration.prototype = {
        creating: function (type) {
            if (typeof type != 'function')
                throw new Error('Type is not a function');

            ensureTyping(this._parameterType, type);

            return this.calling(function (c) { return c.resolve(type); });
        },

        using: function (value) {
            if (value === undefined)
                throw new Error('Value is undefined');

            ensureTyping(this._parameterType, value);

            return this.calling(function () { return value; });
        },

        calling: function (factory) {
            if (typeof factory != 'function')
                throw new Error('Factory is not a function');

            return this._typeRegistration.useParameterHook(this._matchParameter, factory);
        }
    };

    function ParameterHook(matchParameter, resolveValue) {
        if (typeof matchParameter != 'function') throw new Error('Match callback is not a function');
        if (typeof resolveValue != 'function') throw new Error('Resolve callback is not a function');

        this.matches = matchParameter;
        this.resolve = resolveValue;
    }

    function ensureTyping(baseType, subType) {
        if (typeof baseType != 'function' || subType === null)
            return;

        var doesNotInherit = ' does not inherit from ' + (baseType.name || 'anonymous base type');

        if (typeof subType == 'function') {
            if (baseType != subType && !(subType.prototype instanceof baseType))
                throw new Error((subType.name || 'Anonymous type') + doesNotInherit);
        } else if (typeof subType == 'object') {
            if (!(subType instanceof baseType))
                throw new Error('Value' + doesNotInherit);
        }
    }

    function Container(registrationMap, defaultLifetime) {
        this._registrations = registrationMap;
        this._defaultLifetime = defaultLifetime;
        this._disposables = [];
        this._containerScope = new InstanceScope(this);
        this._registrationScope = [];

        this._registerSelf();
    };

    Container.prototype = {
        resolve: function (type) {
            if (type == null)
                throw new Error("Tried to resolve '" + type + "'");

            var registration = this.getRegistration(type);

            this._registrationScope.push(registration);
            var resolved = registration.factory(this);
            this._registrationScope.pop();

            if (resolved === undefined)
                throw new Error("Failed to resolve " + registration.name + this._resolveChain());

            ensureTyping(type, resolved);

            return resolved;
        },

        getRegistration: function (type) {
            var registration = type instanceof Registration
                ? type
                : this._registrations[getKey(type)];

            if (!registration && typeof type == 'string')
                throw new Error("Failed to resolve key '" + type + "'" + this._resolveChain());

            return registration
               || new RegistrationBuilder(this._defaultLifetime).create(type).build(this);
        },

        _resolveChain: function () {
            return this._registrationScope.length
                ? " while attempting to resolve "
                    + this._registrationScope
                        .map(function (r) { return r.name; })
                        .join(' -> ')
                : '';
        },

        buildSubContainer: function (registration) {
            var builder = new ContainerBuilder(this._registrations);
            builder.setDefaultLifetime(this._defaultLifetime);

            if (registration)
                registration(builder);

            var subContainer = builder.build();

            this.registerDisposable(subContainer);

            return subContainer;
        },

        isRegistered: function (type) {
            return getKey(type) in this._registrations;
        },

        registerDisposable: function (instance) {
            if (!instance || typeof instance.dispose != 'function')
                return;

            var oldDispose = instance.dispose;
            instance.dispose = function () {
                this._unregisterDisposable(instance);
                oldDispose.call(instance);
            }.bind(this);
            this._disposables.push(instance);
        },

        _unregisterDisposable: function (disposable) {
            extract(this._disposables, function (d) {
                return d == disposable;
            });
        },

        _registerSelf: function () {
            var key = getOrCreateKey(Container);
            this._registrations[key] = new RegistrationBuilder().forType(Container).use(this).build(this);
        },

        dispose: function () {
            this._disposables.slice().forEach(function (disposable) {
                disposable.dispose();
            });
        }
    };

    function InstanceScope(ownerContainer) {
        this._instances = {};
        this._ownerContainer = ownerContainer;
    }

    InstanceScope.prototype = {
        getOrCreate: function (key, registration, instanceFactory) {
            return key in this._instances
                ? this._instances[key]
                : this.add(key, instanceFactory(this._ownerContainer, registration));
        },

        add: function (key, instance) {
            this._instances[key] = instance;
            this._ownerContainer.registerDisposable(instance);
            return instance;
        }
    };

    function constructorFactory(constructor) {
        var dependencies = constructor.dependencies || [];
        var paramNames = constructor.parameters
            || /\(([^\)]*)\)/.exec(constructor.toString())[1]
                .split(',')
                .map(function (p) { return p.trim(); })
                .filter(function (p) { return !!p; });

        var parameters = paramNames.map(function (p, i) {
            return new Parameter(dependencies[i], p, i);
        });

        return function (container, registration) {
            var args = parameters.map(resolveParameter);
            var resolvedConstructor = Function.prototype.bind.apply(constructor, [null].concat(args));
            return new resolvedConstructor();

            function resolveParameter(parameter) {
                var parameterHooks = registration.parameterHooks;
                for (var i = 0; i < parameterHooks.length; i++)
                    if (parameterHooks[i].matches(parameter))
                        return parameterHooks[i].resolve(container, parameter);

                if (parameter.type)
                    return container.resolve(parameter.type);

                var key = paramKey(parameter.name);
                if (container.isRegistered(key))
                    return container.resolve(key);
            }
        };
    }

    function Parameter(type, name, index) {
        this.type = type;
        this.name = name;
        this.index = index;
    }

    function valueFactory(value) {
        return function () {
            return value;
        };
    }

    function factoryFor(type, params) {
        return new RegistrationBuilder()
            .call(function (container) {
                return function () {
                    var specifiedParams = pairArgsWithParams(arguments);

                    var typeRegistration = container.getRegistration(type);
                    var parameterisedRegistration = buildParameterisedRegistration(typeRegistration, specifiedParams);

                    return container.resolve(parameterisedRegistration);
                };
            })
            .build();

        function pairArgsWithParams(args) {
            return (params || []).map(function (paramType, i) {
                return { type: paramType, value: args[i] };
            });
        }

        function buildParameterisedRegistration(typeRegistration, specifiedParams) {
            var parameterisedRegistration = Object.create(typeRegistration);
            parameterisedRegistration.parameterHooks = [useSpecifiedParameter()].concat(typeRegistration.parameterHooks);
            return parameterisedRegistration;

            function useSpecifiedParameter() {
                return new ParameterHook(
                    function (p) { return specifiedParams.some(matchesTypeOf(p)); },
                    function (c, p) { return extract(specifiedParams, matchesTypeOf(p)).value; });
            }
        }

        function matchesTypeOf(parameter) {
            return function (other) {
                return other.type == parameter.type;
            };
        }
    }

    function optional(type, defaultValue) {
        if (defaultValue === undefined)
            defaultValue = null;
        return new RegistrationBuilder()
            .call(function (container) {
                return container.isRegistered(type)
                    ? container.resolve(type)
                    : defaultValue;
            })
            .build();
    }

    function named(type, key) {
        return new RegistrationBuilder()
            .call(function (container) {
                var instance = container.resolve(key);
                ensureTyping(type, instance);
                return instance;
            })
            .build();
    }

    function getOrCreateKey(type) {
        var key = getKey(type);
        return key
            ? key
            : (type.$injectId = uid++);
    }

    function getKey(type) {
        return typeof type == 'string'
            ? type
            : type.$injectId;
    }

    function paramKey(name) {
        return parameterMarker + name;
    }

    function ctor(dependencies, constructor) {
        if (dependencies.some(function (d) { return !d; }))
            throw new Error((constructor.name || 'Type') + ' has an undefined dependency');

        if (dependencies.length != constructor.length)
            throw new Error((constructor.name || 'Type') + ' has ' + dependencies.length + ' dependencies, but ' + constructor.length + ' parameter(s)');

        constructor.dependencies = dependencies;
        return constructor;
    }

    function extract(array, predicate) {
        for (var i = 0; i < array.length; i++) {
            if (predicate(array[i])) {
                return array.splice(i, 1)[0];
            }
        }
    }

    global.Injection = {
        ContainerBuilder: ContainerBuilder,
        RegistrationBuilder: RegistrationBuilder,
        Container: Container,
        Parameter: Parameter,
        ctor: ctor,
        factoryFor: factoryFor,
        optional: optional,
        named: named
    };
})(window);
