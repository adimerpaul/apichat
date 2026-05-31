class NumberParser {
  static int toInt(dynamic value) {
    if (value is int) {
      return value;
    }

    return int.tryParse(value?.toString() ?? '') ?? 0;
  }
}

class StringParser {
  static String value(dynamic value) {
    return value?.toString() ?? '';
  }

  static String? nullable(dynamic value) {
    final parsed = value?.toString();
    if (parsed == null || parsed.isEmpty) {
      return null;
    }

    return parsed;
  }
}
