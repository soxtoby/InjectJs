(function (global) {
    'use strict';

    var uid = 1;

    function Builder() {
        this._registrations = [];
    };

    Builder.prototype = {
        build: function () {
            return new Container(this._registrations);
        },

        register: function (constructor) {
            var registration = new Registration(constructor);
            this._registrations.push(registration);
            return registration;
        }
    };

    function Registration(value) {
        this.value = value;
        this.registeredAs = [];
    }

    Registration.prototype = {
        as: function (interfaces) {
            this.registeredAs = this.registeredAs.concat(interfaces);
        }
    };

    function Container(registrations) {
        this._registrations = {};
        registrations.forEach(function (registration) {
            registration.registeredAs.forEach(function (type) {
                this._registrations[getOrCreateKey(type)] = registration;
            }, this);
        }, this);
    };

    Container.prototype = {
        resolve: function (type) {
            var key = getKey(type);
            
            var registration = this._registrations[key];
            if (registration) {
                if (typeof registration.value == 'function')
                    return this._construct(registration.value);
                else
                    return registration.value;
            }

            return this._construct(type);
        },
        
        _construct: function(constructor) {
            var dependencies = constructor.dependencies || [];
            var args = dependencies.map(this.resolve, this);

            var resolvedConstructor = Function.prototype.bind.apply(constructor, [null].concat(args));
            return new resolvedConstructor();
        }
    };

    function getOrCreateKey(type) {
        if (!type.$injectId)
            type.$injectId = uid++;
        return type.$injectId;
    }

    function getKey(type) {
        return type.$injectId;
    }

    global.Inject = {
        Builder: Builder
    };
})(window);