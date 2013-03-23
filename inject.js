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

            var factory = typeof type == 'function'
                ? constructorFactory(type)
                : valueFactory(type);
            var registration = this.registerFactory(factory);
            registration.as(type);
            return registration;
        },

        registerFactory: function (factory) {
            var registration = new Registration(factory);
            this._registrations.push(registration);
            return registration;
        }
    };

    function Registration(factory) {
        this.factory = factory;
        this.registeredAs = [];
        this._id = uid++;
    }

    Registration.prototype = {
        as: function (interfaces) {
            this.registeredAs = this.registeredAs.concat(interfaces);
        },

        singleInstance: function () {
            var instanceFactory = this.factory;
            var instance;
            this.factory = function (container) {
                return instance
                    || (instance = instanceFactory(container));
            };
        },

        instancePerContainer: function () {
            var instanceFactory = this.factory;
            this.factory = function (container) {
                if (!(this._id in container._containerScopedInstances))
                    container._containerScopedInstances[this._id] = instanceFactory(container);
                return container._containerScopedInstances[this._id];
            };
        }
    };

    function Container(registrations) {
        this._registrations = {};
        this._disposables = [];
        this._containerScopedInstances = {};

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

            if (resolved == null)
                throw new Error(
                    (typeof type == 'function' ? "Type" : "'" + type + "'")
                    + ' resolved to ' + resolved);

            if (typeof resolved.dispose == 'function')
                this._registerDisposable(resolved);

            return resolved;
        },

        buildSubContainer: function (registration) {
            var builder = new Builder();

            if (registration)
                registration(builder);

            var subContainer = builder.build();

            Object.keys(this._registrations).forEach(function (key) {
                if (!(key in subContainer._registrations))
                    subContainer._registrations[key] = this._registrations[key];
            }, this);

            this._registerDisposable(subContainer);

            return subContainer;
        },

        _registerDisposable: function (disposable) {
            var oldDispose = disposable.dispose;
            disposable.dispose = function () {
                this._unregisterDisposable(disposable);
                oldDispose.call(disposable);
            }.bind(this);
            this._disposables.push(disposable);
        },

        _unregisterDisposable: function (disposable) {
            for (var i = 0; i < this._disposables.length; i++) {
                if (this._disposables[i] == disposable) {
                    this._disposables.splice(i, 1);
                    break;
                }
            }
        },

        dispose: function () {
            this._disposables.slice().forEach(function (disposable) {
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

    function valueFactory(value) {
        return function () {
            return value;
        };
    }

    function factoryFor(type) {
        return new Registration(function (container) {
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
        Container: Container,
        ctor: ctor,
        factoryFor: factoryFor
    };
})(window);