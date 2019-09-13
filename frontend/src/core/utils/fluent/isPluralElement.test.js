import isPluralElement from './isPluralElement';
import parser from './parser';


describe('isPluralElement', () => {
    it('returns false for elements that are not select expressions', () => {
        const input = 'my-entry = Hello!';
        const message = parser.parseEntry(input);
        const element = message.value.elements[0];

        expect(isPluralElement(element)).toEqual(false);
    });

    it('returns true if all variant keys are CLDR plurals', () => {
        const input = `
my-entry =
    { $num ->
        [one] Hello!
       *[two] World!
    }`;
        const message = parser.parseEntry(input);
        const element = message.value.elements[0];

        expect(isPluralElement(element)).toEqual(true);
    });

    it('returns true if all variant keys are numbers', () => {
        const input = `
my-entry =
    { $num ->
        [1] Hello!
       *[2] World!
    }`;
        const message = parser.parseEntry(input);
        const element = message.value.elements[0];

        expect(isPluralElement(element)).toEqual(true);
    });

    it('returns true if one variant key is a CLDR plural and the other is a number', () => {
        const input = `
my-entry =
    { $num ->
        [one] Hello!
       *[1] World!
    }`;
        const message = parser.parseEntry(input);
        const element = message.value.elements[0];

        expect(isPluralElement(element)).toEqual(true);
    });

    it('returns false for if at least one variant key is neither a CLDR plural nor a number', () => {
        const input = `
my-entry =
    { $num ->
        [variant] Hello!
       *[another-variant] World!
    }`;
        const message = parser.parseEntry(input);
        const element = message.value.elements[0];

        expect(isPluralElement(element)).toEqual(false);
    });
});