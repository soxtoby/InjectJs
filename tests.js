describe("injection", function () {
    var builder = new Inject.Builder();

    when("nothing registered", function () {
        var sut = builder.build();

        when("resolving existing class", function () {
            function unregisteredClass() { };
            var result = sut.resolve(unregisteredClass);

            it("instantiates unregistered class", function () {
                result.should.be.an.instanceOf(unregisteredClass);
            });
        });

        when("type has multiple dependencies", function () {
            function dependency1() { }
            function dependency2() { }

            var type = Inject.ctor([dependency1, dependency2],
                function(d1, d2) {
                    this.dependency1 = d1;
                    this.dependency2 = d2;
                });

            when("resolving type", function() {
                var result = sut.resolve(type);

                it("instantiates type with dependencies", function () {
                    result.dependency1.should.be.an.instanceOf(dependency1);
                    result.dependency2.should.be.an.instanceOf(dependency2);
                });
            });

            when("resolving factory function with no parameters", function() {
                var factory = sut.resolve(Inject.factoryFor(type));

                then("calling factory instantiates type with dependencies", function() {
                    var result = factory();
                    result.dependency1.should.be.an.instanceOf(dependency1);
                    result.dependency2.should.be.an.instanceOf(dependency2);    
                });
            });
        });
    });

    when("container has been built", function() {
        builder.build();

        when("registering another type throws an exception", function() {
            should.throw(function () {
                builder.register(function () { });
            }, Inject.PostBuildRegistrationError);
        });
    });

    when("subtype is registered as super type", function () {
        function superClass() { }
        function subClass() { }
        subClass.prototype = new superClass();

        builder.register(subClass).as(superClass);
        var sut = builder.build();

        when("resolving super type", function () {
            var result = sut.resolve(superClass);

            it("instantiates the sub class", function () {
                result.should.be.an.instanceOf(subClass);
            });
        });
    });

    when("type is registered as multiple interfaces", function () {
        function expectedType() { }
        function interface1() { }
        function interface2() { }

        builder.register(expectedType).as([interface1, interface2]);
        var sut = builder.build();

        when("resolving the first interface", function () {
            var result = sut.resolve(interface1);

            it("instantiates the implementation", function () {
                result.should.be.an.instanceOf(expectedType);
            });
        });

        when("resolving the second interface", function () {
            var result = sut.resolve(interface2);

            it("instantiates the implementation", function () {
                result.should.be.an.instanceOf(expectedType);
            });
        });
    });

    when("object instance is registered as type", function () {
        function type() {}
        var obj = {};
        builder.register(obj).as(type);
        var sut = builder.build();

        when("type is resolved", function() {
            var result = sut.resolve(type);

            it("resolves to the object", function() {
                result.should.equal(obj);
            });
        });
    });

    when("type is registered as a named dependency", function() {
        function type() { }

        builder.register(type).as('named');

        when("resolving named dependency", function() {
            var sut = builder.build();
            var result = sut.resolve('named');

            it("resolves to instance of the registered type", function() {
                result.should.be.an.instanceOf(type);
            });
        });

        when("another type is registered with a different name", function() {
            function type2() { }

            builder.register(type2).as('different');
            var sut = builder.build();

            when("resolving first name", function() {
                var result = sut.resolve('named');

                it("resolves to instance of the first type", function () {
                    result.should.be.an.instanceOf(type);
                });
            });

            when("resolving the second name", function() {
                var result = sut.resolve('different');

                it("resolves to instance of the second type", function() {
                    result.should.be.an.instanceOf(type2);
                });
            });
        });
    });
});