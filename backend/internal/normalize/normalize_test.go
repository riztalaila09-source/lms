package normalize_test

import (
	"testing"

	"github.com/stretchr/testify/assert"

	"lms/backend/internal/normalize"
)

func TestName(t *testing.T) {
	cases := map[string]string{
		"lucky ardiansyah sakti": "Lucky Ardiansyah Sakti",
		"LUCKY ARDIANSYAH SAKTI": "Lucky Ardiansyah Sakti",
		"Lucky ardiansyah SAKTI": "Lucky Ardiansyah Sakti",
		"  lucky   ardiansyah  ": "Lucky Ardiansyah", // collapse + trim
		"":                       "",
		"budi santoso, S.Pd":     "Budi Santoso, S.Pd",     // academic title kept
		"HJ. sri wahyuni, M.Kom": "HJ. Sri Wahyuni, M.Kom",  // dotted tokens kept verbatim
		"muhammad al-fatih":      "Muhammad Al-Fatih",       // hyphen segments
		"siti":                   "Siti",
	}
	for in, want := range cases {
		assert.Equal(t, want, normalize.Name(in), "Name(%q)", in)
	}
}

func TestPhoneID(t *testing.T) {
	cases := map[string]string{
		"81234567890":     "081234567890", // leading 0 lost (Excel)
		"081234567890":    "081234567890", // already fine
		"6281234567890":   "081234567890", // country code
		"+62 812-3456-78": "0812345678",   // spaces/dashes/plus stripped, 62 -> 0
		"0812 3456 7890":  "081234567890", // spaces stripped
		"":                "",
		"   ":             "",
		"021555123":       "021555123", // landline already 0
		"7123":            "7123",      // non-standard -> digits kept
	}
	for in, want := range cases {
		assert.Equal(t, want, normalize.PhoneID(in), "PhoneID(%q)", in)
	}
}
