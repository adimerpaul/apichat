import '../utils/parsers.dart';

class ChatMessage {
  const ChatMessage({
    required this.id,
    required this.userId,
    required this.userName,
    required this.message,
    required this.createdAt,
    this.mediaType,
    this.mediaUrl,
    this.mediaName,
  });

  final int id;
  final int userId;
  final String userName;
  final String message;
  final DateTime createdAt;
  final String? mediaType;
  final String? mediaUrl;
  final String? mediaName;

  factory ChatMessage.fromJson(Map<String, dynamic> json) {
    return ChatMessage(
      id: NumberParser.toInt(json['id']),
      userId: NumberParser.toInt(json['user_id']),
      userName: StringParser.value(json['user_name']),
      message: StringParser.value(json['message']),
      mediaType: StringParser.nullable(json['media_type']),
      mediaUrl: StringParser.nullable(json['media_url']),
      mediaName: StringParser.nullable(json['media_name']),
      createdAt:
          DateTime.tryParse(StringParser.value(json['created_at'])) ??
          DateTime.now(),
    );
  }
}
