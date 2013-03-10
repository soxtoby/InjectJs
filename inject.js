(function(global) {
    'use strict';

    var uid = 1;

    function Builder() {
        this._registrations = [];
    };

    Builder.prototype = {
        build: function() {
            return new Container(this._registrations);
        },
        
        register: function (constructor) {
            var registration = new Registration(constructor);
            this._registrations.push(registration);
            return registration;
        }
    };

    function Registration(constructor) {
        this.constructor = constructor;
        this.registeredAs = [];
    }

    Registration.prototype = {
        as: function (interfaces) {
            this.registeredAs = this.registeredAs.concat(interfaces);
        },
        
        asPrototypes: function() {
            var prototype = this.constructor.prototype;
            var constructor = prototype.constructor;
            this.registeredAs.push(constructor);
        }
    };

    function Container(registrations) {
        this._registrations = {};
        registrations.forEach(function (registration) {
            registration.registeredAs.forEach(function(type) {
                this._registrations[getOrCreateKey(type)] = registration;
            }, this);
        }, this);
    };

    Container.prototype = {
        resolve: function (constructor) {
            var key = getKey(constructor);
            if (this._registrations[key])
                return new this._registrations[key].constructor();
            return new constructor();
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