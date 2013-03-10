describe("injection", function() {
    var builder = new Inject.Builder();

    when("nothing registered", function() {
        var sut = builder.build();

        when("resolving existing class", function() {
            function existingClass() { };
            var result = sut.resolve(existingClass);

            it("instantiates existing class", function() {
                result.should.be.an.instanceOf(existingClass);
            });
        });
    });

    when("subtype is registered as super type", function() {
        function superClass() { }
        function subClass() { }
        subClass.prototype = new superClass();

        builder.register(subClass).as(superClass);
        var sut = builder.build();

        when("resolving super type", function() {
            var result = sut.resolve(superClass);

            it("instantiates the sub class", function() {
                result.should.be.an.instanceOf(subClass);
            });
        });
    });

    when("type is registered as multiple interfaces", function() {
        function implementation() { }
        function interface1() { }
        function interface2() { }

        builder.register(implementation).as([interface1, interface2]);
        var sut = builder.build();

        when("resolving the first interface", function() {
            var result = sut.resolve(interface1);

            it("instantiates the implementation", function() {
                result.should.be.an.instanceOf(implementation);
            });
        });

        when("resolving the second interface", function () {
            var result = sut.resolve(interface2 );

            it("instantiates the implementation", function () {
                result.should.be.an.instanceOf(implementation);
            });
        });
    });
});