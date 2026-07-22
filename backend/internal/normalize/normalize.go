// Package normalize provides consistent formatting for person names and
// Indonesian phone numbers, so data entered manually, via the API, or imported
// from spreadsheets is stored uniformly.
package normalize

import (
	"strings"
	"unicode"
)

// Name returns a person's name in Title Case, collapsing extra whitespace.
// Word tokens that contain a '.' are treated as academic titles/abbreviations
// (e.g. "S.Pd", "M.Kom", "Hj.") and kept exactly as written. Hyphenated words
// are title-cased per segment ("al-fatih" -> "Al-Fatih").
//
//	"lucky ardiansyah sakti" -> "Lucky Ardiansyah Sakti"
//	"LUCKY ARDIANSYAH SAKTI" -> "Lucky Ardiansyah Sakti"
//	"budi santoso, S.Pd"     -> "Budi Santoso, S.Pd"
func Name(s string) string {
	words := strings.Fields(s)
	for i, w := range words {
		words[i] = titleWord(w)
	}
	return strings.Join(words, " ")
}

func titleWord(w string) string {
	// Keep academic titles / abbreviations (anything with a dot) untouched.
	if strings.Contains(w, ".") {
		return w
	}
	parts := strings.Split(w, "-")
	for i, p := range parts {
		parts[i] = capitalize(p)
	}
	return strings.Join(parts, "-")
}

func capitalize(p string) string {
	if p == "" {
		return p
	}
	rs := []rune(strings.ToLower(p))
	rs[0] = unicode.ToUpper(rs[0])
	return string(rs)
}

// PhoneID normalizes an Indonesian phone number to local "0…" form:
//   - keeps only the digits (so "+62 812-3456" -> "628123456");
//   - a "62" country-code prefix becomes "0";
//   - a number starting with "8" (leading 0 lost, e.g. from Excel) gets "0";
//   - a number already starting with "0" is kept;
//   - anything else is returned as its digits; empty stays empty.
func PhoneID(s string) string {
	var b strings.Builder
	for _, r := range s {
		if r >= '0' && r <= '9' {
			b.WriteRune(r)
		}
	}
	d := b.String()
	switch {
	case d == "":
		return ""
	case strings.HasPrefix(d, "62") && len(d) > 2:
		return "0" + d[2:]
	case strings.HasPrefix(d, "0"):
		return d
	case strings.HasPrefix(d, "8"):
		return "0" + d
	default:
		return d
	}
}
