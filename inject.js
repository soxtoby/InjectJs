(function (global) {
    'use strict';

    var uid = 1;

    function Builder() {
        this._registrations = [];
    };

    Builder.prototype = {
        build: function () {
            this._containerBuilt = true;
            return new Container(this._registrations);
        },

        register: function (type) {
            if (this._containerBuilt)
                throw new Error('Cannot register anything else once the container has been built');

            var registration = typeof type == 'function'
                ? new Registration(constructorFactory(type))
                : new Registration(instanceFactory(type));
            this._registrations.push(registration);
            return registration;
        }
    };

    function Registration(factory) {
        this.factory = factory;
        this.registeredAs = [];
    }

    Registration.prototype = {
        as: function (interfaces) {
            this.registeredAs = this.registeredAs.concat(interfaces);
        }
    };

    function Container(registrations) {
        this._registrations = {};
        this._disposables = [];
        
        registrations.forEach(function (registration) {
            registration.registeredAs.forEach(function (type) {
                this._registrations[getOrCreateKey(type)] = registration;
            }, this);
        }, this);
    };

    Container.prototype = {
        resolve: function (type) {
            var key = getKey(type);

            var registration = type instanceof Registration
                ? type
                : this._registrations[key];

            if (!registration && !(typeof type == 'function'))
                throw new Error("Nothing registered as '" + type + "'");

            var resolved = registration
                ? registration.factory(this)
                : constructorFactory(type)(this);

            if (typeof resolved.dispose == 'function')
                this._disposables.push(resolved);

            return resolved;
        },
        
        buildSubContainer: function (registration) {
            var builder = new Builder();
            
            if (registration)
                registration(builder);
            
            var subContainer = builder.build();

            Object.keys(this._registrations).forEach(function(key) {
                if (!(key in subContainer._registrations))
                    subContainer._registrations[key] = this._registrations[key];
            }, this);

            return subContainer;
        },
        
        dispose: function() {
            this._disposables.forEach(function(disposable) {
                disposable.dispose();
            });
        }
    };

    function constructorFactory(constructor) {
        return function (container) {
            var dependencies = constructor.dependencies || [];
            var args = dependencies.map(container.resolve, container);

            var resolvedConstructor = Function.prototype.bind.apply(constructor, [null].concat(args));
            return new resolvedConstructor();
        };
    }

    function instanceFactory(value) {
        return function () {
            return value;
        };
    }

    function factoryFor(type) {
        return new Registration(function(container) {
            return function () {
                return container.resolve(type);
            };
        });
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

    function ctor(dependencies, constructor) {
        constructor.dependencies = dependencies;
        return constructor;
    }

    global.Inject = {
        Builder: Builder,
        ctor: ctor,
        factoryFor: factoryFor
    };
})(window);