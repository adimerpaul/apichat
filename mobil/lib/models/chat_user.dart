import '../utils/parsers.dart';

class ChatUser {
  const ChatUser({required this.id, required this.name});

  final int id;
  final String name;

  factory ChatUser.fromJson(Map<String, dynamic> json) {
    return ChatUser(
      id: NumberParser.toInt(json['id']),
      name: StringParser.value(json['name']),
    );
  }
}
