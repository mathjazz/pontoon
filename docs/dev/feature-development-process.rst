Feature Development Process
===========================

https://github.com/mozilla/pontoon/
https://mozilla-pontoon.readthedocs.io/en/latest/index.html

https://www.python.org/dev/peps/pep-0001/#submitting-a-pep
https://www.python.org/dev/peps/pep-0012/#how-to-use-this-template

Adding a new feature to Pontoon requires going through a process that is
described in this document.

The steps are:
    Feature idea / request
    Specification
    Bug(s)
    Code
    Documentation
    Review
    Release

Feature idea / request
----------------------
Someone proposes a change to make to Pontoon. It can be a simple idea of a
brand new feature, or a change to an existing feature, or removing a feature…

-> Where? How?

Specification
-------------

The idea needs to be turned into a full specification, explaining what the
feature is about, why it would improve Pontoon, what it will impact, and touch
lightly on what changes would be required.

How to write a specification is still to be defined.

-> Maybe: as a file in Pontoon, added via a PR that would be reviewed, and the 
spec can evolve with the feature.

-> We have a template now

-> How to publicize the process to get more feedback?

Bug(s)
------

Once the specification is complete, it needs to be turned into as many bugs as 
possible, splitting the feature in the smallest possible chunks. It is 
organised so that it’s easy to get the full picture of the work needed for that 
feature, and it is easy to know where to start and where to go from each step.

Code
----

For each bug, someone writes the code that is required. It should be complete 
code, with unit tests and feature flagging if needed.

Documentation
-------------

The person writing the code is also responsible for updating the associated 
documentation. If there is no documentation about the feature yet, they should 
write it.

In some cases, features will require better discoverability. Such cases might 
be when the feature is big, when it is hidden away, when it has impact on 
several parts of Pontoon…

Better discoverability can mean an in-app announcement, a full-fledged tutorial 
that users get shown when they first face the feature, or a range of other 
things (to be defined).

Review
------

Someone from the core Pontoon team reviews the code and documentation, making 
sure that it is sane, it has good test coverage, and it is correctly 
documented.

Release
-------

The Pontoon team releases the feature to stage then production, ensuring that 
it works correctly, then mark the feature as complete when it applies.
